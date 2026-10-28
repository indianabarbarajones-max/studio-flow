import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { test, type TestContext } from 'node:test';
import { createApp } from '../server/app.ts';
import type { StudioState } from '../shared/types.ts';

const testPin = '753129';
type Options = { appPin?: string; production?: boolean; appOrigin?: string; aiApiKey?: string };
async function running(databasePath: string, options: Options = {}) {
  const { app, close } = createApp({ databasePath, aiApiKey: '', appPin: testPin, production: false, appOrigin: '', ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let closed = false;
  return {
    request(path: string, method = 'GET', data?: unknown, cookie?: string, headers: Record<string, string> = {}) {
      const allHeaders = { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers };
      // Node fetch normalizes Host; use native HTTP to exercise reverse-proxy Host handling.
      if (headers.Host) return new Promise<Response>((resolve, reject) => {
        const request = httpRequest(base + path, { method, headers: allHeaders }, response => {
          const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            const responseHeaders = new Headers();
            for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
            resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), { status: response.statusCode, headers: responseHeaders }));
          });
        });
        request.once('error', reject); if (data !== undefined) request.write(JSON.stringify(data)); request.end();
      });
      return fetch(base + path, { method, headers: allHeaders, body: data === undefined ? undefined : JSON.stringify(data), redirect: 'manual' });
    },
    async login(pin = testPin, headers: Record<string, string> = {}) {
      const response = await this.request('/api/auth/login', 'POST', { pin }, undefined, headers);
      return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
    },
    async stop() {
      if (closed) return; closed = true;
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      close();
    },
  };
}
async function fixture(t: TestContext, options: Options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'studio-auth-'));
  const databasePath = join(dir, 'test.sqlite');
  const api = await running(databasePath, options);
  t.after(async () => { await api.stop(); await rm(dir, { recursive: true, force: true }); });
  return { ...api, databasePath };
}

test('new studio is blank and every private API requires the shared PIN session', async t => {
  const api = await fixture(t);
  assert.deepEqual(await (await api.request('/api/auth/status')).json(), { authenticated: false });
  assert.equal((await api.request('/api/health')).status, 200);
  const privateRoutes = [
    ['/api/state', 'GET'], ['/api/settings', 'PATCH'], ['/api/students', 'POST'],
    ['/api/assistant', 'POST'], ['/api/integrations', 'GET'], ['/api/integrations/google/connect', 'GET'],
    ['/api/integrations/google/callback?code=x&state=x', 'GET'], ['/api/integrations/google/disconnect', 'POST'],
    ['/api/classes/nonexistent/google-sync', 'POST'], ['/api/tasks/nonexistent', 'DELETE'],
  ];
  for (const [path, method] of privateRoutes) assert.equal((await api.request(path, method, method === 'GET' ? undefined : {})).status, 401, path);
  const { cookie, response } = await api.login(); assert.equal(response.status, 200);
  const state: StudioState = await (await api.request('/api/state', 'GET', undefined, cookie)).json();
  for (const collection of ['students', 'transactions', 'classes', 'tasks', 'content', 'goals'] as const) assert.deepEqual(state[collection], [], collection);
  assert.equal(state.demo, false);
  assert.equal(state.settings.studioName, 'Meu Studio');
  assert.equal(state.settings.ownerName, '');
});

test('PIN login issues an opaque HttpOnly cookie; logout revokes it on the server', async t => {
  const api = await fixture(t);
  assert.equal((await api.login('000000')).response.status, 401);
  assert.equal((await api.request('/api/auth/login', 'POST', { pin: 753129 })).status, 401);
  const { response, cookie } = await api.login();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/i);
  assert.match(response.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
  assert.match(cookie, /^studio_session=[a-f0-9]{64}$/);
  assert.equal(cookie.includes(testPin), false);
  assert.deepEqual(await (await api.request('/api/auth/status', 'GET', undefined, cookie)).json(), { authenticated: true });
  assert.equal((await api.request('/api/settings', 'PATCH', { studioName: 'Studio real' }, cookie)).status, 200);
  assert.equal((await api.request('/api/auth/logout', 'POST', {}, cookie)).status, 200);
  assert.equal((await api.request('/api/state', 'GET', undefined, cookie)).status, 401);
  assert.deepEqual(await (await api.request('/api/auth/status', 'GET', undefined, cookie)).json(), { authenticated: false });
});

test('sessions survive process restart and changing the PIN revokes existing sessions', async t => {
  const api = await fixture(t);
  const { cookie } = await api.login();
  await api.stop();
  const reopened = await running(api.databasePath);
  try { assert.equal((await reopened.request('/api/state', 'GET', undefined, cookie)).status, 200); }
  finally { await reopened.stop(); }
  const rotated = await running(api.databasePath, { appPin: '864297' });
  try {
    assert.equal((await rotated.request('/api/state', 'GET', undefined, cookie)).status, 401);
    assert.equal((await rotated.login(testPin)).response.status, 401);
    assert.equal((await rotated.login('864297')).response.status, 200);
  } finally { await rotated.stop(); }
});

test('failed PIN attempts are limited and the limit survives restart', async t => {
  const api = await fixture(t);
  for (let count = 0; count < 6; count++) assert.equal((await api.login('999999')).response.status, 401);
  let response = (await api.login()).response;
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  await api.stop();
  const reopened = await running(api.databasePath);
  try {
    response = (await reopened.login()).response;
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) <= 900);
  } finally { await reopened.stop(); }
});

test('production uses secure host-only cookies and rejects foreign hosts and origins', async t => {
  const api = await fixture(t, { production: true, appOrigin: 'https://studio.example.com' });
  assert.equal((await api.request('/api/health')).status, 200, 'platform health probes need no public Host');
  assert.equal((await api.request('/api/auth/status')).status, 403);
  const headers = { Host: 'studio.example.com', Origin: 'https://studio.example.com' };
  const { response, cookie } = await api.login(testPin, headers);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') ?? '', /Secure/i);
  assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/i);
  assert.match(cookie, /^__Host-studio_session=/);
  assert.match(response.headers.get('set-cookie') ?? '', /Path=\//);
  assert.doesNotMatch(response.headers.get('set-cookie') ?? '', /Domain=/i);
  assert.equal((await api.request('/api/state', 'GET', undefined, cookie, headers)).status, 200);
  assert.equal((await api.request('/api/settings', 'PATCH', { studioName: 'CSRF attempt' }, cookie, { ...headers, Origin: 'https://unrelated.example.com' })).status, 403);
  assert.equal((await api.request('/api/settings', 'PATCH', { studioName: 'CSRF attempt' }, cookie, { ...headers, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});

test('studio memory and marketing settings persist without exposing PIN, sessions, or provider credentials', async t => {
  const key = 'fake-provider-sentinel-for-auth-test';
  const api = await fixture(t, { aiApiKey: key });
  const { cookie } = await api.login();
  const settings = { studioName: 'Studio com propósito', ownerName: 'Responsável', description: 'Prática acolhedora', audience: 'Pessoas iniciantes', tone: 'Acolhedor e claro', services: 'Hatha e Vinyasa', studioMemory: 'Sempre convidar para conversar antes de apresentar planos.' };
  assert.equal((await api.request('/api/settings', 'PATCH', settings, cookie)).status, 200);
  for (const path of ['/api/state', '/api/integrations']) {
    const response = await api.request(path, 'GET', undefined, cookie);
    const raw = await response.text();
    assert.equal(response.status, 200);
    assert.equal(raw.includes(key), false);
    assert.equal(raw.includes(testPin), false);
    assert.equal(raw.includes(cookie.split('=')[1]), false);
    assert.equal(raw.includes('auth:sessions'), false);
  }
  const publicHtml = await (await api.request('/')).text();
  assert.equal(publicHtml.includes(testPin), false);
  assert.equal(publicHtml.includes(key), false);
  assert.equal(publicHtml.includes(settings.studioMemory), false);
  await api.stop();
  const reopened = await running(api.databasePath);
  try {
    const state: StudioState = await (await reopened.request('/api/state', 'GET', undefined, cookie)).json();
    for (const [field, value] of Object.entries(settings)) assert.equal(state.settings[field as keyof typeof settings], value);
  } finally { await reopened.stop(); }
});

test('server-protected authentication fields cannot be changed through studio settings', async t => {
  const api = await fixture(t);
  const { cookie } = await api.login();
  for (const patch of [{ appPin: '0000' }, { authenticated: true }, { aiApiKey: 'secret' }, { googleRefreshToken: 'secret' }]) {
    assert.equal((await api.request('/api/settings', 'PATCH', patch, cookie)).status, 400);
  }
  const response = await api.request('/api/state', 'GET', undefined, cookie);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).settings.studioName, 'Meu Studio');
});

test('successful team logins do not accumulate the failed-attempt IP limit', async t => {
  const api = await fixture(t);
  for (let attempt = 0; attempt < 8; attempt++) assert.equal((await api.login()).response.status, 200);
});
