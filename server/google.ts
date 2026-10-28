import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Store } from './store.ts';
import type { IntegrationStatus, YogaClass } from '../shared/types.ts';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const TOKEN_KEY = 'google.tokens';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

type MetadataStore = Pick<Store, 'getMeta' | 'setMeta' | 'deleteMeta'>;
interface Tokens { accessToken: string; refreshToken: string; expiresAt: number; connectionId: string }
interface OAuthAttempt { stateHash: string; sessionHash: string; expiresAt: number; verifier: string }
interface Mapping { eventId: string; connectionId?: string; status: 'pending' | 'synced' | 'error'; attempted: boolean; error?: string }
export interface GoogleOptions {
  databasePath?: string;
  appOrigin?: string;
  clientId?: string;
  clientSecret?: string;
  encryptionKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
}
export class GoogleIntegrationError extends Error {
  constructor(message: string, public code = 'GOOGLE_ERROR') { super(message); this.name = 'GoogleIntegrationError'; }
}

/** OAuth credentials and tokens stay in server metadata, never in StudioState. */
export class GoogleIntegration {
  private readonly origin: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly keyFile: string;
  private readonly suppliedKey: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private encryptionKey?: Buffer;
  private refreshInFlight?: Promise<Tokens>;
  private readonly jobs = new Map<string, Promise<unknown>>();
  constructor(private readonly store: MetadataStore, options: GoogleOptions = {}) {
    this.origin = validOrigin(options.appOrigin ?? process.env.APP_ORIGIN ?? '');
    this.clientId = (options.clientId ?? process.env.GOOGLE_CLIENT_ID ?? '').trim();
    this.clientSecret = (options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
    this.keyFile = resolve(dirname(options.databasePath ?? process.env.DATABASE_PATH ?? '.data/studio.sqlite'), '.google-encryption-key');
    this.suppliedKey = options.encryptionKey ?? process.env.INTEGRATION_ENCRYPTION_KEY ?? '';
    // Workers' fetch requires the global receiver when stored on an instance.
    this.fetcher = options.fetch ?? fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  status(): IntegrationStatus['google'] {
    const missing = [!this.origin && 'APP_ORIGIN', !this.clientId && 'GOOGLE_CLIENT_ID', !this.clientSecret && 'GOOGLE_CLIENT_SECRET'].filter(Boolean) as string[];
    let connected = false;
    try { const token = this.tokens(); connected = Boolean(token?.refreshToken); } catch { /* Invalid/missing key requires reconnect; never expose ciphertext or key details. */ }
    return { configured: missing.length === 0, connected: connected && missing.length === 0, calendarId: 'primary', missing };
  }

  begin(sessionId: string): string {
    this.requireConfigured();
    if (!sessionId) throw new GoogleIntegrationError('Entre no studio antes de conectar o Google.', 'SESSION_REQUIRED');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const attempt: OAuthAttempt = { stateHash: hash(state), sessionHash: hash(sessionId), expiresAt: this.now() + 10 * 60_000, verifier };
    this.store.setMeta(this.oauthKey(sessionId), this.encrypt(attempt));
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri(), response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events', access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return url.toString();
  }

  async complete(code: string, state: string, sessionId: string): Promise<void> {
    this.requireConfigured();
    const key = this.oauthKey(sessionId);
    const encoded = this.store.getMeta<string>(key);
    if (!sessionId || !encoded || !state || state.length > 256 || !code || code.length > 4096) throw new GoogleIntegrationError('A autorização do Google é inválida ou expirou. Conecte novamente.', 'INVALID_STATE');
    const attempt = this.decrypt<OAuthAttempt>(encoded);
    if (attempt.expiresAt < this.now()) { this.store.deleteMeta(key); throw new GoogleIntegrationError('A autorização do Google expirou. Conecte novamente.', 'EXPIRED_STATE'); }
    if (!constantEqual(attempt.stateHash, hash(state)) || !constantEqual(attempt.sessionHash, hash(sessionId))) throw new GoogleIntegrationError('A autorização não corresponde a esta sessão. Conecte novamente.', 'INVALID_STATE');
    // Consume before token exchange, so a code/state pair cannot be replayed.
    this.store.deleteMeta(key);
    const data = await this.tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: this.redirectUri(), code_verifier: attempt.verifier });
    if (typeof data.refresh_token !== 'string' || !data.refresh_token) throw new GoogleIntegrationError('O Google não concedeu acesso contínuo. Desconecte a autorização do Studio Flow na sua conta Google e tente novamente.', 'NO_REFRESH_TOKEN');
    const tokens: Tokens = { accessToken: accessToken(data), refreshToken: data.refresh_token, expiresAt: this.now() + expiresIn(data) * 1000, connectionId: randomBytes(16).toString('hex') };
    this.store.setMeta(TOKEN_KEY, this.encrypt(tokens));
  }

  async disconnect(): Promise<void> {
    let token: Tokens | undefined;
    try { token = this.tokens(); } catch { /* User can remove an unreadable connection. */ }
    // Keep event mappings: disconnecting never deletes appointments on Google's side.
    this.store.deleteMeta(TOKEN_KEY);
    if (!token) return;
    try {
      const result = await this.fetcher(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.refreshToken }), signal: AbortSignal.timeout(15000) });
      if (!result.ok && result.status !== 400) throw new Error('revoke');
    } catch { throw new GoogleIntegrationError('O studio foi desconectado. Não foi possível confirmar a revogação no Google; remova também o acesso do Studio Flow nas permissões da sua conta Google.', 'REVOKE_UNCONFIRMED'); }
  }

  decorate(cls: YogaClass): YogaClass {
    const map = this.mapping(cls.id);
    if (map?.status === 'error') return { ...cls, googleSyncStatus: 'error', googleSyncError: map.error };
    if (!cls.syncToGoogle && !map) return { ...cls, googleSyncStatus: 'off', googleSyncError: undefined };
    if (cls.syncToGoogle) {
      let currentConnection: string | undefined;
      try { currentConnection = this.tokens()?.connectionId; } catch { /* Display pending until reconnection. */ }
      const synced = map?.status === 'synced' && currentConnection && currentConnection === map.connectionId;
      return { ...cls, googleSyncStatus: synced ? 'synced' : 'pending', googleSyncError: undefined };
    }
    return { ...cls, googleSyncStatus: 'pending', googleSyncError: undefined };
  }

  /** Save class locally before calling. Failures are recorded, and the record stays retryable. */
  async sync(cls: YogaClass): Promise<YogaClass> {
    return this.serial(cls.id, async () => {
      const previous = this.mapping(cls.id);
      if (!cls.syncToGoogle && !previous) return this.decorate(cls);
      if (!cls.syncToGoogle) {
        try { await this.removeRemote(cls); }
        catch (error) { this.recordError(cls.id, previous, error); }
        return this.decorate(cls);
      }
      let map: Mapping = previous ?? { eventId: this.eventId(cls.id), status: 'pending', attempted: false };
      map = { ...map, status: 'pending', error: undefined };
      this.store.setMeta(this.mappingKey(cls.id), map);
      try {
        const token = await this.usableTokens();
        // Persist before the network call. A timeout may have created the remote event;
        // future retries use this same ID and never create a second appointment.
        map = { ...map, attempted: true, connectionId: token.connectionId };
        this.store.setMeta(this.mappingKey(cls.id), map);
        const payload = this.eventPayload(cls);
        const path = `${EVENTS_URL}/${map.eventId}`;
        const lookup = await this.calendarRequest(path, { method: 'GET' });
        if (lookup.ok) {
          this.assertOwned(await lookup.json(), cls.id);
          const updated = await this.calendarRequest(`${path}?sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(payload) });
          this.requireOk(updated);
        } else if (lookup.status === 404 || lookup.status === 410) {
          const created = await this.calendarRequest(`${EVENTS_URL}?sendUpdates=none`, { method: 'POST', body: JSON.stringify({ ...payload, id: map.eventId }) });
          if (created.status === 409) {
            const found = await this.calendarRequest(path, { method: 'GET' });
            this.requireOk(found);
            this.assertOwned(await found.json(), cls.id);
            this.requireOk(await this.calendarRequest(`${path}?sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(payload) }));
          } else this.requireOk(created);
        } else this.requireOk(lookup);
        this.store.setMeta(this.mappingKey(cls.id), { ...map, status: 'synced', error: undefined });
      } catch (error) { this.recordError(cls.id, map, error); }
      return this.decorate(cls);
    });
  }

  /** Delete remote first; on failure the caller must keep the local class for a retry. */
  async remove(cls: YogaClass): Promise<void> {
    return this.serial(cls.id, async () => {
      try { await this.removeRemote(cls); }
      catch (error) { this.recordError(cls.id, this.mapping(cls.id), error); throw safeError(error); }
    });
  }

  private async removeRemote(cls: YogaClass) {
    const map = this.mapping(cls.id);
    if (!map || !map.attempted) { this.store.deleteMeta(this.mappingKey(cls.id)); return; }
    const path = `${EVENTS_URL}/${map.eventId}`;
    const found = await this.calendarRequest(path, { method: 'GET' });
    if (found.status !== 404 && found.status !== 410) {
      this.requireOk(found);
      this.assertOwned(await found.json(), cls.id);
      const deleted = await this.calendarRequest(`${path}?sendUpdates=none`, { method: 'DELETE' });
      if (deleted.status !== 404 && deleted.status !== 410) this.requireOk(deleted);
    }
    this.store.deleteMeta(this.mappingKey(cls.id));
  }
  private async serial<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prior = this.jobs.get(id) ?? Promise.resolve();
    const current = prior.catch(() => {}).then(task);
    this.jobs.set(id, current);
    try { return await current; } finally { if (this.jobs.get(id) === current) this.jobs.delete(id); }
  }
  private eventPayload(cls: YogaClass) {
    const start = `${cls.date}T${cls.startTime}:00`;
    const end = new Date(new Date(`${start}Z`).getTime() + cls.duration * 60_000).toISOString().slice(0, 19);
    return { summary: cls.title, description: `Compromisso do Studio Flow. Responsável: ${cls.instructor}`, start: { dateTime: start, timeZone: 'America/Sao_Paulo' }, end: { dateTime: end, timeZone: 'America/Sao_Paulo' }, extendedProperties: { private: { studioFlowOwner: this.instanceId(), studioFlowClass: cls.id } } };
  }
  private assertOwned(data: unknown, classId: string) {
    const privateData = (data as { extendedProperties?: { private?: Record<string, string> } })?.extendedProperties?.private;
    if (privateData?.studioFlowOwner !== this.instanceId() || privateData.studioFlowClass !== classId) throw new GoogleIntegrationError('Já existe um evento com este identificador que não pertence ao studio. Nenhum compromisso externo foi alterado.', 'NOT_OWNED');
  }
  private instanceId() {
    let id = this.store.getMeta<string>('google.instanceId');
    if (!id) { id = randomBytes(16).toString('hex'); this.store.setMeta('google.instanceId', id); }
    return id;
  }
  private eventId(classId: string) { return hash(`${this.instanceId()}:${classId}`); }
  private mappingKey(id: string) { return `google.event.${hash(id)}`; }
  private mapping(id: string) { return this.store.getMeta<Mapping>(this.mappingKey(id)); }
  private recordError(id: string, prior: Mapping | undefined, error: unknown) { this.store.setMeta(this.mappingKey(id), { ...(prior ?? { eventId: this.eventId(id), attempted: false }), status: 'error', error: safeError(error).message }); }
  private oauthKey(session: string) { return `google.oauth.${hash(session)}`; }
  private redirectUri() { return `${this.origin}/api/integrations/google/callback`; }
  private requireConfigured() { if (!this.status().configured) throw new GoogleIntegrationError('A conexão Google precisa ser configurada na hospedagem: APP_ORIGIN, GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.', 'NOT_CONFIGURED'); }
  private tokens(): Tokens | undefined { const encrypted = this.store.getMeta<string>(TOKEN_KEY); return encrypted ? this.decrypt<Tokens>(encrypted) : undefined; }
  private async usableTokens(): Promise<Tokens> {
    this.requireConfigured();
    const token = this.tokens();
    if (!token) throw new GoogleIntegrationError('Conecte o Google Agenda nas configurações do studio.', 'NOT_CONNECTED');
    if (token.expiresAt > this.now() + 30_000) return token;
    if (!this.refreshInFlight) this.refreshInFlight = (async () => {
      const data = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refreshToken });
      const updated: Tokens = { ...token, accessToken: accessToken(data), refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : token.refreshToken, expiresAt: this.now() + expiresIn(data) * 1000 };
      // Disconnect/reconnect while a refresh is in flight must never restore the old grant.
      if (this.tokens()?.connectionId !== token.connectionId) throw new GoogleIntegrationError('A conexão Google mudou. Tente novamente.', 'CONNECTION_CHANGED');
      this.store.setMeta(TOKEN_KEY, this.encrypt(updated));
      return updated;
    })();
    try { return await this.refreshInFlight; } finally { this.refreshInFlight = undefined; }
  }
  private async tokenRequest(values: Record<string, string>): Promise<Record<string, unknown>> {
    let response: Response;
    try { response = await this.fetcher(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...values, client_id: this.clientId, client_secret: this.clientSecret }), signal: AbortSignal.timeout(15000) }); }
    catch { throw new GoogleIntegrationError('Não foi possível contatar o Google. Tente novamente.', 'NETWORK_ERROR'); }
    if (!response.ok) throw new GoogleIntegrationError('O Google não autorizou a conexão. Reconecte sua conta nas configurações.', 'TOKEN_REJECTED');
    try { return await response.json() as Record<string, unknown>; } catch { throw new GoogleIntegrationError('O Google retornou uma resposta inválida. Tente novamente.', 'INVALID_RESPONSE'); }
  }
  private async calendarRequest(url: string, options: RequestInit, refresh = true): Promise<Response> {
    const token = await this.usableTokens();
    let response: Response;
    try { response = await this.fetcher(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) }); }
    catch { throw new GoogleIntegrationError('O Google Agenda não respondeu. O compromisso foi mantido no studio; tente sincronizar novamente.', 'NETWORK_ERROR'); }
    if (response.status === 401 && refresh) {
      const latest = this.tokens();
      if (latest?.connectionId === token.connectionId && latest.accessToken === token.accessToken) this.store.setMeta(TOKEN_KEY, this.encrypt({ ...latest, expiresAt: 0 }));
      return this.calendarRequest(url, options, false);
    }
    return response;
  }
  private requireOk(response: Response) { if (!response.ok) throw new GoogleIntegrationError(response.status === 401 || response.status === 403 ? 'O Google não permitiu esta ação. Reconecte a conta e confira a permissão do calendário.' : 'Não foi possível atualizar o Google Agenda. Tente sincronizar novamente.', `CALENDAR_HTTP_${response.status}`); }
  private key() {
    if (this.encryptionKey) return this.encryptionKey;
    if (this.suppliedKey) {
      const key = /^[a-fA-F0-9]{64}$/.test(this.suppliedKey) ? Buffer.from(this.suppliedKey, 'hex') : Buffer.from(this.suppliedKey, 'base64');
      if (key.length !== 32) throw new GoogleIntegrationError('A chave de proteção da conexão Google está inválida na hospedagem.', 'ENCRYPTION_KEY_INVALID');
      return this.encryptionKey = key;
    }
    if (!existsSync(this.keyFile)) {
      // Missing encryption key with an existing connection cannot be repaired by replacing it.
      if (this.store.getMeta(TOKEN_KEY)) throw new GoogleIntegrationError('A chave de proteção da conexão Google não foi encontrada. Restaure o backup da hospedagem.', 'ENCRYPTION_KEY_MISSING');
      mkdirSync(dirname(this.keyFile), { recursive: true, mode: 0o700 });
      try { writeFileSync(this.keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    const key = readFileSync(this.keyFile);
    if (key.length !== 32) throw new GoogleIntegrationError('A chave de proteção da conexão Google está inválida na hospedagem.', 'ENCRYPTION_KEY_INVALID');
    return this.encryptionKey = key;
  }
  private encrypt(data: unknown) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  private decrypt<T>(value: string): T {
    try { const raw = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', this.key(), raw.subarray(0, 12)); decipher.setAuthTag(raw.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as T; }
    catch (error) { if (error instanceof GoogleIntegrationError) throw error; throw new GoogleIntegrationError('Não foi possível ler a conexão Google. Reconecte nas configurações.', 'TOKEN_UNREADABLE'); }
  }
}
function safeError(error: unknown) { return error instanceof GoogleIntegrationError ? error : new GoogleIntegrationError('Não foi possível sincronizar com o Google Agenda. Tente novamente.'); }
function accessToken(data: Record<string, unknown>) { if (typeof data.access_token !== 'string' || !data.access_token || String(data.token_type ?? '').toLowerCase() !== 'bearer') throw new GoogleIntegrationError('O Google retornou uma autorização inválida. Reconecte sua conta.', 'INVALID_TOKEN'); return data.access_token; }
function expiresIn(data: Record<string, unknown>) { const value = Number(data.expires_in); if (!Number.isFinite(value) || value <= 0 || value > 31_536_000) throw new GoogleIntegrationError('O Google retornou uma autorização inválida. Reconecte sua conta.', 'INVALID_TOKEN'); return value; }
function constantEqual(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
function validOrigin(value: string) { try { const url = new URL(value); if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return ''; if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) return ''; return url.origin; } catch { return ''; } }
