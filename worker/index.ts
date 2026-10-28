import { DurableObject } from 'cloudflare:workers';
import { randomBytes } from 'node:crypto';
import { Repository, collections } from '../server/repository.ts';
import { PinAuth, type AuthRequest, type AuthResponse } from '../server/auth.ts';
import { GoogleIntegration, GoogleIntegrationError } from '../server/google.ts';
import { assistant } from '../server/assistant.ts';
import { object, validateEntity, validateSettings, ValidationError } from '../server/validation.ts';
import type { Collection, Entity, YogaClass } from '../shared/types.ts';

interface Env {
  STUDIO: DurableObjectNamespace<Studio>;
  ASSETS: Fetcher;
  APP_PIN: string;
  APP_ORIGIN?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  INTEGRATION_ENCRYPTION_KEY?: string;
}

const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers });
const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

function secureResponse(response: Response, request: Request): Response {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  result.headers.set('Cache-Control', 'no-store');
  if (new URL(request.url).protocol === 'https:') result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return result;
}

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

async function bodyOf(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new HttpError(413, 'Solicitação muito grande.'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return {};
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, 'O corpo da solicitação contém JSON inválido.'); }
}

/** The same session and throttling implementation used by the Node server. */
function authResponse(action: (res: AuthResponse) => unknown): Response {
  const headers = new Headers();
  let status = 200;
  let payload: unknown = {};
  const response: AuthResponse = {
    setHeader(name, value) { headers.set(name, String(value)); },
    status(value) { status = value; return response; },
    json(value) { payload = value; },
    cookie(name, value, options) {
      headers.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}; Max-Age=${Math.floor((options.maxAge ?? 0) / 1000)}`);
    },
    clearCookie(name, options) {
      headers.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}; Max-Age=0`);
    },
  };
  action(response);
  return json(payload, status, headers);
}

/** One named object per deployment: all devices share the same persistent studio. */
export class Studio extends DurableObject<Env> {
  private readonly store: Repository;
  private auth?: PinAuth;
  private google?: GoogleIntegration;
  private origin?: string;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Repository({
      all: (sql, ...bindings) => ctx.storage.sql.exec(sql, ...bindings).toArray(),
      run: (sql, ...bindings) => { ctx.storage.sql.exec(sql, ...bindings); },
      transaction: operation => ctx.storage.transactionSync(operation),
    });
  }

  async fetch(request: Request): Promise<Response> {
    try { return secureResponse(await this.route(request), request); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof ValidationError ? 400 : error instanceof GoogleIntegrationError ? 502 : 500;
      const message = status === 500 ? 'Não foi possível concluir a operação. Tente novamente.' : (error as Error).message;
      if (status === 500) console.error('Falha interna na API:', error instanceof Error ? error.name : 'UnknownError');
      return secureResponse(json({ error: message }, status), request);
    }
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname: path } = url;
    const method = request.method;
    if (path === '/api/health' && method === 'GET') return json({ status: 'ok' });
    if (!/^\d{4,12}$/.test(this.env.APP_PIN ?? '')) throw new HttpError(503, 'Defina o PIN de acesso nas configurações da hospedagem para iniciar o studio.');
    const origin = this.env.APP_ORIGIN ? new URL(this.env.APP_ORIGIN).origin : url.origin;
    if (origin !== url.origin) throw new HttpError(403, 'Endereço de acesso não autorizado.');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new HttpError(403, 'Use o endereço HTTPS do studio.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const incoming = request.headers.get('Origin');
      if ((incoming && incoming !== origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'Origem não autorizada para alterações.');
    }
    if (!this.auth) this.auth = new PinAuth(this.store, this.env.APP_PIN, url.protocol === 'https:');
    if (!this.google || this.origin !== origin) {
      // Keep the generated key in private durable storage; never the ephemeral filesystem.
      let key = this.env.INTEGRATION_ENCRYPTION_KEY || this.store.getMeta<string>('integration:encryption-key');
      if (!key) { key = randomBytes(32).toString('hex'); this.store.setMeta('integration:encryption-key', key); }
      this.google = new GoogleIntegration(this.store, { appOrigin: origin, encryptionKey: key, clientId: this.env.GOOGLE_CLIENT_ID ?? '', clientSecret: this.env.GOOGLE_CLIENT_SECRET ?? '' });
      this.origin = origin;
    }
    const auth = this.auth;
    const google = this.google;
    const apiKey = (this.env.AI_API_KEY ?? '').trim();
    const model = this.env.AI_MODEL?.trim() || 'gpt-4.1-mini';
    const authRequest: AuthRequest = { headers: { cookie: request.headers.get('Cookie') ?? undefined }, ip: request.headers.get('CF-Connecting-IP') || 'unknown' };
    if (path === '/api/auth/status' && method === 'GET') return json({ authenticated: Boolean(auth.session(authRequest)) });
    if (path === '/api/auth/login' && method === 'POST') {
      authRequest.body = object(await bodyOf(request));
      return authResponse(res => auth.login(authRequest, res));
    }
    if (path === '/api/auth/logout' && method === 'POST') return authResponse(res => auth.logout(authRequest, res));
    const session = auth.session(authRequest);
    if (!session) throw new HttpError(401, 'Entre com o PIN para acessar o studio.');
    if (path === '/api/state' && method === 'GET') {
      const state = this.store.state(Boolean(apiKey));
      state.classes = state.classes.map(cls => google.decorate(cls));
      return json(state);
    }
    if (path === '/api/settings' && method === 'PATCH') return json(this.store.setSettings(validateSettings(await bodyOf(request), this.store.settings())));
    if (path === '/api/integrations' && method === 'GET') return json({ ai: { configured: Boolean(apiKey), model }, google: google.status() });
    if (path === '/api/integrations/google/connect' && method === 'GET') {
      try { return redirect(google.begin(session)); } catch { return redirect('/?google=error#settings'); }
    }
    if (path === '/api/integrations/google/callback' && method === 'GET') {
      try { await google.complete(url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '', session); return redirect('/?google=connected#settings'); }
      catch (error) {
        console.warn('Falha na autorização Google:', error instanceof GoogleIntegrationError ? error.code : error instanceof Error ? error.name : 'UnknownError');
        return redirect('/?google=error#settings');
      }
    }
    if (path === '/api/integrations/google/disconnect' && method === 'POST') { await google.disconnect(); return json(google.status()); }
    const retry = path.match(/^\/api\/classes\/([^/]+)\/google-sync$/);
    if (retry && method === 'POST') {
      const cls = this.store.get('classes', retry[1]) as YogaClass | undefined;
      if (!cls) throw new HttpError(404, 'Compromisso não encontrado.');
      return json(await google.sync(cls));
    }
    if (path === '/api/assistant' && method === 'POST') {
      const input = object(await bodyOf(request));
      if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 2000) throw new ValidationError('Escreva uma mensagem entre 1 e 2.000 caracteres.');
      const wait = auth.limit('assistant', 'studio', 30, 60 * 60 * 1000);
      if (wait) return json({ error: 'Limite de consultas por hora atingido. Tente mais tarde.' }, 429, { 'Retry-After': String(wait) });
      try { return json(await assistant(input.message.trim(), this.store.state(Boolean(apiKey)), apiKey, model)); }
      catch { throw new HttpError(502, 'A IA não respondeu. Confira a chave de API, os créditos e o modelo configurado na hospedagem. Nenhuma ação foi executada.'); }
    }
    const match = path.match(/^\/api\/([^/]+)(?:\/([^/]+))?$/);
    if (match && collections.includes(match[1] as Collection)) {
      const collection = match[1] as Collection;
      const id = match[2];
      if (!id && method === 'POST') {
        const data = validateEntity(collection, await bodyOf(request), this.store);
        if (collection === 'classes' && data.syncToGoogle && !google.status().connected) throw new ValidationError('Conecte o Google Agenda nas configurações antes de ativar o envio.');
        const record = this.store.create(collection, data);
        return json(collection === 'classes' ? await google.sync(record as YogaClass) : record, 201);
      }
      if (id && ['PATCH', 'DELETE'].includes(method)) {
        // Finish reading before looking up the record, so concurrent updates use current data.
        const input = method === 'PATCH' ? await bodyOf(request) : undefined;
        const entity = this.store.get(collection, id);
        if (!entity) throw new HttpError(404, 'Registro não encontrado.');
        if (method === 'PATCH') {
          const data = validateEntity(collection, input, this.store, entity);
          if (collection === 'classes' && data.syncToGoogle && !(entity as YogaClass).syncToGoogle && !google.status().connected) throw new ValidationError('Conecte o Google Agenda nas configurações.');
          const record = this.store.put(collection, { ...data, id } as unknown as Entity);
          return json(collection === 'classes' ? await google.sync(record as YogaClass) : record);
        }
        if (collection === 'classes') {
          try { await google.remove(entity as YogaClass); }
          catch { throw new HttpError(502, 'Não foi possível remover o evento do Google. O compromisso foi preservado; reconecte a agenda e tente novamente.'); }
        }
        this.store.delete(collection, id);
        return new Response(null, { status: 204 });
      }
    }
    throw new HttpError(404, 'Rota não encontrada.');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/')) return env.STUDIO.get(env.STUDIO.idFromName('studio')).fetch(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
