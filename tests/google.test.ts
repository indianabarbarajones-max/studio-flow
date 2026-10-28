import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Store } from '../server/store.ts';
import { GoogleIntegration, GoogleIntegrationError } from '../server/google.ts';
import type { YogaClass } from '../shared/types.ts';

const cls: YogaClass = { id: 'calendar-class-1', title: 'Planejamento de conteúdo', date: '2026-10-27', startTime: '23:30', duration: 60, capacity: 2, instructor: 'Responsável', studentIds: [], syncToGoogle: true };
const options = { appOrigin: 'https://studio.example.com', clientId: 'client-id-sentinel', clientSecret: 'client-secret-sentinel', encryptionKey: 'a1'.repeat(32) };
function provider() {
  const events = new Map<string, Record<string, unknown>>();
  const calls: { url: string; method: string; body?: Record<string, unknown> | URLSearchParams; authorization?: string }[] = [];
  let failure = false;
  let lostCreationReply = false;
  let tokenExchanges = 0;
  const mock: typeof fetch = async (input, init) => {
    const url = String(input); const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body instanceof URLSearchParams ? init.body : typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, authorization: headers.get('Authorization') ?? undefined });
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenExchanges++;
      return Response.json({ access_token: `access-token-sentinel-${tokenExchanges}`, token_type: 'Bearer', refresh_token: 'refresh-token-sentinel', expires_in: 3600 });
    }
    if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });
    assert.ok(url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events'));
    if (failure) return Response.json({ error: 'provider-private-error-must-not-leak' }, { status: 503 });
    const id = new URL(url).pathname.split('/events/')[1];
    if (method === 'GET') return events.has(id) ? Response.json(events.get(id)) : Response.json({}, { status: 404 });
    if (method === 'POST') {
      const event = body as Record<string, unknown>;
      if (events.has(String(event.id))) return Response.json({}, { status: 409 });
      events.set(String(event.id), event);
      if (lostCreationReply) { lostCreationReply = false; throw new Error('timed out after remote write'); }
      return Response.json(event);
    }
    if (method === 'PATCH') { const updated = { ...events.get(id), ...body }; events.set(id, updated); return Response.json(updated); }
    if (method === 'DELETE') { events.delete(id); return new Response(null, { status: 204 }); }
    throw new Error('unexpected provider call');
  };
  return { mock, calls, events, fail(value: boolean) { failure = value; }, loseNextCreationReply() { lostCreationReply = true; } };
}
async function connect(google: GoogleIntegration, session = 'session-one') {
  const url = new URL(google.begin(session));
  const state = url.searchParams.get('state')!;
  await google.complete('authorization-code-sentinel', state, session);
  return state;
}

test('Google configuration is honest and OAuth is session-bound, single-use and expiring', async () => {
  const store = new Store(':memory:');
  try {
    const absent = new GoogleIntegration(store, { ...options, appOrigin: '', clientId: '', clientSecret: '' });
    assert.deepEqual(absent.status(), { configured: false, connected: false, calendarId: 'primary', missing: ['APP_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] });
    assert.throws(() => absent.begin('session'), { code: 'NOT_CONFIGURED' });
    const p = provider(); let clock = Date.now();
    const google = new GoogleIntegration(store, { ...options, fetch: p.mock, now: () => clock });
    const url = new URL(google.begin('session-one'));
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.events');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://studio.example.com/api/integrations/google/callback');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.has('client_secret'), false);
    const state = url.searchParams.get('state')!;
    await assert.rejects(() => google.complete('code', state, 'wrong-session'), { code: 'INVALID_STATE' });
    await assert.rejects(() => google.complete('code', 'wrong-state', 'session-one'), { code: 'INVALID_STATE' });
    await google.complete('code', state, 'session-one');
    assert.equal(google.status().connected, true);
    await assert.rejects(() => google.complete('code', state, 'session-one'), { code: 'INVALID_STATE' });
    const expired = new URL(google.begin('session-two')).searchParams.get('state')!;
    clock += 11 * 60_000;
    await assert.rejects(() => google.complete('code', expired, 'session-two'), { code: 'EXPIRED_STATE' });
    assert.equal(p.calls.filter(call => call.url.endsWith('/token')).length, 1);
    const secretPayload = p.calls.find(call => call.url.endsWith('/token'))!.body as URLSearchParams;
    assert.equal(secretPayload.get('client_secret'), options.clientSecret);
    assert.ok(secretPayload.get('code_verifier'));
    assert.equal(JSON.stringify(store.state()).includes('token-sentinel'), false);
    assert.equal(JSON.stringify(store.state()).includes('client-secret-sentinel'), false);
    assert.equal(store.getMeta<string>('google.tokens')!.includes('token-sentinel'), false);
  } finally { store.close(); }
});

test('Google credentials persist encrypted across restart and local key has restrictive permissions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-google-'));
  const databasePath = join(dir, 'test.sqlite');
  const p = provider();
  let store = new Store(databasePath);
  try {
    const first = new GoogleIntegration(store, { ...options, encryptionKey: '', databasePath, fetch: p.mock });
    await connect(first);
    const encrypted = store.getMeta<string>('google.tokens')!;
    assert.equal(encrypted.includes('refresh-token'), false);
    const keyFile = join(dir, '.google-encryption-key');
    assert.equal(statSync(keyFile).mode & 0o777, 0o600);
    assert.equal(readFileSync(keyFile).length, 32);
    store.close(); store = new Store(databasePath);
    const restored = new GoogleIntegration(store, { ...options, encryptionKey: '', databasePath, fetch: p.mock });
    assert.equal(restored.status().connected, true);
    assert.equal((await restored.sync(cls)).googleSyncStatus, 'synced');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('Google sync is opt-in, has correct cross-midnight times, updates once, and removes only owned events', async () => {
  const store = new Store(':memory:'); const p = provider();
  try {
    const google = new GoogleIntegration(store, { ...options, fetch: p.mock });
    await connect(google);
    const before = p.calls.length;
    assert.equal((await google.sync({ ...cls, syncToGoogle: false })).googleSyncStatus, 'off');
    assert.equal(p.calls.length, before);
    assert.equal((await google.sync(cls)).googleSyncStatus, 'synced');
    assert.equal(p.events.size, 1);
    const event = [...p.events.values()][0];
    assert.deepEqual(event.start, { dateTime: '2026-10-27T23:30:00', timeZone: 'America/Sao_Paulo' });
    assert.deepEqual(event.end, { dateTime: '2026-10-28T00:30:00', timeZone: 'America/Sao_Paulo' });
    assert.equal('attendees' in event, false);
    assert.equal(JSON.stringify(event).includes('studentIds'), false);
    assert.equal((await google.sync({ ...cls, title: 'Título atualizado' })).googleSyncStatus, 'synced');
    assert.equal(p.events.size, 1);
    assert.equal([...p.events.values()][0].summary, 'Título atualizado');
    assert.equal(p.calls.filter(call => call.method === 'POST' && call.url.includes('/events')).length, 1);
    assert.ok(p.calls.filter(call => ['POST', 'PATCH'].includes(call.method) && call.url.includes('/events')).every(call => call.url.includes('sendUpdates=none')));
    assert.equal((await google.sync({ ...cls, syncToGoogle: false })).googleSyncStatus, 'off');
    assert.equal(p.events.size, 0);
    assert.equal((await google.sync(cls)).googleSyncStatus, 'synced');
    const id = [...p.events.keys()][0];
    p.events.set(id, { summary: 'Evento que não pertence ao app' });
    const guarded = await google.sync(cls);
    assert.equal(guarded.googleSyncStatus, 'error');
    assert.match(guarded.googleSyncError!, /não pertence/);
    await assert.rejects(() => google.remove(cls), { code: 'NOT_OWNED' });
    assert.equal(p.events.size, 1);
    assert.equal(p.events.get(id)!.summary, 'Evento que não pertence ao app');
  } finally { store.close(); }
});

test('Google sync retries a lost creation response without duplicating and preserves mappings on failures', async () => {
  const store = new Store(':memory:'); const p = provider();
  try {
    const google = new GoogleIntegration(store, { ...options, fetch: p.mock });
    await connect(google);
    p.loseNextCreationReply();
    const failed = await google.sync(cls);
    assert.equal(failed.googleSyncStatus, 'error');
    assert.equal(p.events.size, 1);
    assert.equal((await google.sync(cls)).googleSyncStatus, 'synced');
    assert.equal(p.events.size, 1);
    p.fail(true);
    assert.equal((await google.sync({ ...cls, title: 'Mudança pendente' })).googleSyncStatus, 'error');
    await assert.rejects(() => google.remove(cls), GoogleIntegrationError);
    assert.equal(p.events.size, 1);
    assert.equal(google.decorate(cls).googleSyncStatus, 'error');
    assert.equal(google.decorate(cls).googleSyncError!.includes('provider-private-error'), false);
    p.fail(false);
    await google.remove(cls);
    assert.equal(p.events.size, 0);
    assert.equal(google.decorate({ ...cls, syncToGoogle: false }).googleSyncStatus, 'off');
  } finally { store.close(); }
});

test('Expired Google access tokens refresh once and disconnect keeps Google events without exposing credentials', async () => {
  const store = new Store(':memory:'); const p = provider(); let clock = Date.now();
  try {
    const google = new GoogleIntegration(store, { ...options, fetch: p.mock, now: () => clock });
    await connect(google);
    clock += 61 * 60_000;
    assert.equal((await google.sync(cls)).googleSyncStatus, 'synced');
    const tokenCalls = p.calls.filter(call => call.url.endsWith('/token'));
    assert.equal(tokenCalls.length, 2);
    assert.equal((tokenCalls[1].body as URLSearchParams).get('grant_type'), 'refresh_token');
    assert.equal((tokenCalls[1].body as URLSearchParams).get('refresh_token'), 'refresh-token-sentinel');
    await google.disconnect();
    assert.equal(google.status().connected, false);
    assert.equal(store.getMeta('google.tokens'), undefined);
    assert.equal(p.events.size, 1);
    assert.equal(google.decorate(cls).googleSyncStatus, 'pending');
    assert.equal((await google.sync(cls)).googleSyncStatus, 'error');
    await connect(google, 'another-session');
    assert.equal((await google.sync(cls)).googleSyncStatus, 'synced');
    assert.equal(p.events.size, 1);
  } finally { store.close(); }
});
