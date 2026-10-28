import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Entity, YogaClass } from '../shared/types.ts';
import { Store, collections } from './store.ts';
import { object, validateEntity, validateSettings, ValidationError } from './validation.ts';
import { assistant } from './assistant.ts';
import { PinAuth } from './auth.ts';
import { GoogleIntegration, GoogleIntegrationError } from './google.ts';

interface AppOptions { databasePath?: string; aiApiKey?: string; aiModel?: string; appPin?: string; production?: boolean; appOrigin?: string; seedDemo?: boolean }
export function createApp(options: AppOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const originText = options.appOrigin ?? process.env.APP_ORIGIN ?? process.env.RENDER_EXTERNAL_URL ?? '';
  const origin = originText ? new URL(originText).origin : '';
  if (production && (!origin || !origin.startsWith('https://'))) throw new Error('Configure APP_ORIGIN com o endereço público HTTPS do aplicativo.');
  const pin = options.appPin ?? process.env.APP_PIN ?? (production ? '' : '0000');
  if (!pin) throw new Error('Configure APP_PIN na hospedagem.');
  const databasePath = options.databasePath ?? process.env.DATABASE_PATH ?? resolve('.data/studio.sqlite');
  const store = new Store(databasePath, { seedDemo: options.seedDemo });
  const auth = new PinAuth(store, pin, production);
  const google = new GoogleIntegration(store, { databasePath, appOrigin: origin });
  const apiKey = (options.aiApiKey ?? process.env.AI_API_KEY ?? '').trim();
  const aiModel = (options.aiModel ?? process.env.AI_MODEL ?? '').trim() || 'gpt-4.1-mini';
  const app = express();
  app.disable('x-powered-by');
  if (production) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    // Health probes contain no private data and may use the platform's internal host.
    if (req.path === '/api/health' && req.method === 'GET') return next();
    try {
      const host = new URL(`http://${req.headers.host ?? ''}`);
      const validHost = origin ? host.host === new URL(origin).host : ['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname);
      if (!validHost || host.username || host.password) return res.status(403).json({ error: 'Endereço de acesso não autorizado.' });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
        const incoming = new URL(req.headers.origin);
        const allowed = origin ? incoming.origin === origin : ['http:', 'https:'].includes(incoming.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(incoming.hostname);
        if (!allowed) return res.status(403).json({ error: 'Origem não autorizada para alterações.' });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Origem não autorizada.' });
    } catch { return res.status(403).json({ error: 'Endereço de acesso inválido.' }); }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/auth/status', (req, res) => res.json({ authenticated: Boolean(auth.session(req)) }));
  app.post('/api/auth/login', (req, res) => auth.login(req, res));
  app.post('/api/auth/logout', (req, res) => auth.logout(req, res));
  app.use('/api', (req, res, next) => {
    const session = auth.session(req);
    if (!session) return res.status(401).json({ error: 'Entre com o PIN para acessar o studio.' });
    res.locals.sessionId = session; next();
  });
  app.get('/api/state', (_req, res) => { const state = store.state(Boolean(apiKey)); state.classes = state.classes.map(c => google.decorate(c)); res.json(state); });
  app.patch('/api/settings', (req, res) => res.json(store.setSettings(validateSettings(req.body, store.settings()))));
  app.get('/api/integrations', (_req, res) => res.json({ ai: { configured: Boolean(apiKey), model: aiModel }, google: google.status() }));
  app.get('/api/integrations/google/connect', (_req, res) => { try { res.redirect(google.begin(res.locals.sessionId)); } catch { res.redirect('/?google=error#settings'); } });
  app.get('/api/integrations/google/callback', async (req, res) => {
    try {
      if (typeof req.query.code !== 'string' || typeof req.query.state !== 'string') throw new Error('Invalid callback');
      await google.complete(req.query.code, req.query.state, res.locals.sessionId);
      res.redirect('/?google=connected#settings');
    } catch { res.redirect('/?google=error#settings'); }
  });
  app.post('/api/integrations/google/disconnect', async (_req, res) => { await google.disconnect(); res.json(google.status()); });
  app.post('/api/classes/:id/google-sync', async (req, res) => {
    const cls = store.get('classes', req.params.id) as YogaClass | undefined;
    if (!cls) return res.status(404).json({ error: 'Compromisso não encontrado.' });
    res.json(await google.sync(cls));
  });
  app.post('/api/assistant', async (req, res) => {
    const body = object(req.body);
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) throw new ValidationError('Escreva uma mensagem entre 1 e 2.000 caracteres.');
    const wait = auth.limit('assistant', 'studio', 30, 60 * 60 * 1000);
    if (wait) { res.setHeader('Retry-After', wait); return res.status(429).json({ error: 'Limite de consultas por hora atingido. Tente mais tarde.' }); }
    try { res.json(await assistant(body.message.trim(), store.state(Boolean(apiKey)), apiKey, aiModel)); }
    catch { res.status(502).json({ error: 'A IA não respondeu. Confira a chave de API, os créditos e o modelo configurado na hospedagem. Nenhuma ação foi executada.' }); }
  });
  for (const collection of collections) {
    app.post(`/api/${collection}`, async (req, res) => {
      const data = validateEntity(collection, req.body, store);
      if (collection === 'classes' && data.syncToGoogle && !google.status().connected) throw new ValidationError('Conecte o Google Agenda nas configurações antes de ativar o envio.');
      const record = store.create(collection, data);
      res.status(201).json(collection === 'classes' ? await google.sync(record as YogaClass) : record);
    });
    app.patch(`/api/${collection}/:id`, async (req, res) => {
      const id = req.params.id; const entity = store.get(collection, id);
      if (!entity) return res.status(404).json({ error: 'Registro não encontrado.' });
      const data = validateEntity(collection, req.body, store, entity);
      if (collection === 'classes' && data.syncToGoogle && !(entity as YogaClass).syncToGoogle && !google.status().connected) throw new ValidationError('Conecte o Google Agenda nas configurações.');
      const record = store.put(collection, { ...data, id } as unknown as Entity);
      res.json(collection === 'classes' ? await google.sync(record as YogaClass) : record);
    });
    app.delete(`/api/${collection}/:id`, async (req, res) => {
      const id = req.params.id; const entity = store.get(collection, id);
      if (!entity) return res.status(404).json({ error: 'Registro não encontrado.' });
      if (collection === 'classes') {
        try { await google.remove(entity as YogaClass); } catch { return res.status(502).json({ error: 'Não foi possível remover o evento do Google. O compromisso foi preservado; reconecte a agenda e tente novamente.' }); }
      }
      store.delete(collection, id); res.status(204).end();
    });
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  const dist = resolve('dist');
  if (existsSync(resolve(dist, 'index.html'))) { app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html'))); }
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof GoogleIntegrationError) return res.status(502).json({ error: error.message });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'O corpo da solicitação contém JSON inválido.' });
    if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitação muito grande.' });
    console.error('Falha interna na API:', error instanceof Error ? error.name : 'UnknownError');
    return res.status(500).json({ error: 'Não foi possível concluir a operação. Tente novamente.' });
  });
  return { app, close: () => store.close() };
}
