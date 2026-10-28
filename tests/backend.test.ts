import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { test, type TestContext } from 'node:test';
import { createApp } from '../server/app.ts';
import type { StudioState, Student, Transaction, YogaClass } from '../shared/types.ts';
import { assistant, metrics } from '../server/assistant.ts';
import { offsetDate, seedState } from '../server/seed.ts';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const student = {
  name: 'Pessoa de teste', email: 'teste@example.com', phone: '11999998888',
  plan: 'Mensal', monthlyFee: 250, status: 'active', renewalDate: today,
};

async function running(databasePath: string, aiApiKey = '') {
  const { app, close } = createApp({ databasePath, aiApiKey, seedDemo: true, appPin: '2468' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/api/auth/login`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'2468'})});
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  let closed = false;
  return {
    base,
    async request(path: string, method = 'GET', data?: unknown, headers: Record<string, string> = {}) {
      return fetch(`${base}${path}`, {
        method,
        headers: { Cookie: cookie, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    },
    async stop() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      close();
    },
  };
}

async function fixture(t: TestContext, aiApiKey = '') {
  const dir = await mkdtemp(join(tmpdir(), 'studio-flow-api-'));
  const databasePath = join(dir, 'test.sqlite');
  const api = await running(databasePath, aiApiKey);
  t.after(async () => { await api.stop(); await rm(dir, { recursive: true, force: true }); });
  return { ...api, databasePath };
}

test('serves a usable seeded demo with no credentials exposed', async t => {
  const key = 'server-only-sentinel-do-not-expose';
  const api = await fixture(t, key);
  assert.equal((await api.request('/api/health')).status, 200);
  const response = await api.request('/api/state');
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.equal(raw.includes(key), false);
  const state: StudioState = JSON.parse(raw);
  assert.equal(state.demo, true);
  assert.equal(state.aiConfigured, true);
  assert.ok(state.students.length > 0);
  assert.ok(state.transactions.length > 0);
  assert.ok(state.classes.length > 0);
  assert.ok(state.tasks.length > 0);
  assert.ok(state.content.length > 0);
  assert.ok(state.goals.length > 0);
  assert.ok(state.settings.studioName.length > 0);
});

test('student CRUD persists across database close and reopen', async t => {
  const api = await fixture(t);
  const created = await api.request('/api/students', 'POST', student);
  assert.equal(created.status, 201);
  const record: Student = await created.json();
  assert.ok(record.id);
  const patched = await api.request(`/api/students/${record.id}`, 'PATCH', { plan: 'Trimestral', monthlyFee: 230 });
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).plan, 'Trimestral');
  await api.stop();
  const reopened = await running(api.databasePath);
  try {
    const state: StudioState = await (await reopened.request('/api/state')).json();
    const persisted = state.students.find(item => item.id === record.id);
    assert.equal(persisted?.monthlyFee, 230);
    assert.equal(persisted?.name, student.name);
    assert.equal((await reopened.request(`/api/students/${record.id}`, 'DELETE')).status, 204);
    const after: StudioState = await (await reopened.request('/api/state')).json();
    assert.equal(after.students.some(item => item.id === record.id), false);
    assert.equal((await reopened.request(`/api/students/${record.id}`, 'PATCH', { name: 'Ausente' })).status, 404);
  } finally { await reopened.stop(); }
});

test('rejects invalid dates, amounts, enum values, and oversized fields without mutating state', async t => {
  const api = await fixture(t);
  const before: StudioState = await (await api.request('/api/state')).json();
  for (const patch of [
    { renewalDate: '2026-02-30' },
    { renewalDate: 'amanhã' },
    { monthlyFee: -1 },
    { monthlyFee: '250' },
    { monthlyFee: 1.005 },
    { status: 'unknown' },
    { name: '' },
    { name: 'a'.repeat(10001) },
  ]) {
    const response = await api.request('/api/students', 'POST', { ...student, ...patch });
    assert.equal(response.status, 400, JSON.stringify(patch).slice(0, 120));
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const after: StudioState = await (await api.request('/api/state')).json();
  assert.equal(after.students.length, before.students.length);
});

test('class enrollment enforces capacity, unique IDs and existing students', async t => {
  const api = await fixture(t);
  const state: StudioState = await (await api.request('/api/state')).json();
  const ids = state.students.slice(0, 2).map(item => item.id);
  assert.equal(ids.length, 2);
  const yogaClass = {
    title: 'Hatha de teste', date: today, startTime: '09:00', duration: 60,
    capacity: 1, instructor: 'Instrutora teste', studentIds: [ids[0]],
  };
  const created = await api.request('/api/classes', 'POST', yogaClass);
  assert.equal(created.status, 201);
  const record: YogaClass = await created.json();
  for (const studentIds of [ids, [ids[0], ids[0]], ['student-does-not-exist']]) {
    const response = await api.request(`/api/classes/${record.id}`, 'PATCH', { studentIds });
    assert.equal(response.status, 400);
  }
  assert.equal((await api.request(`/api/classes/${record.id}`, 'PATCH', { capacity: 2, studentIds: ids })).status, 200);
  assert.equal((await api.request(`/api/classes/${record.id}`, 'PATCH', { capacity: 1 })).status, 400);
  const after: StudioState = await (await api.request('/api/state')).json();
  assert.deepEqual(after.classes.find(item => item.id === record.id)?.studentIds, ids);
});

test('deleting a student removes enrollment and unlinks financial records', async t => {
  const api = await fixture(t);
  const created: Student = await (await api.request('/api/students', 'POST', student)).json();
  const yogaClass: YogaClass = await (await api.request('/api/classes', 'POST', {
    title: 'Aula vinculada', date: today, startTime: '11:00', duration: 45,
    capacity: 4, instructor: 'Instrutora', studentIds: [created.id],
  })).json();
  const transaction: Transaction = await (await api.request('/api/transactions', 'POST', {
    description: 'Mensalidade vinculada', category: 'Mensalidades', type: 'income',
    amount: 250, dueDate: today, status: 'pending', studentId: created.id,
  })).json();
  assert.equal((await api.request(`/api/students/${created.id}`, 'DELETE')).status, 204);
  const state: StudioState = await (await api.request('/api/state')).json();
  assert.deepEqual(state.classes.find(item => item.id === yogaClass.id)?.studentIds, []);
  const retained = state.transactions.find(item => item.id === transaction.id);
  assert.ok(retained, 'Financial history should be preserved');
  assert.equal(retained.studentId, undefined);
  assert.equal(retained.amount, 250);
});

test('operational records and settings support validated updates', async t => {
  const api = await fixture(t);
  const cases = [
    ['tasks', { title: 'Revisar pagamentos', area: 'Financeiro', dueDate: today, done: false }, { done: true }],
    ['content', { title: 'Prática consciente', channel: 'Instagram', objective: 'Educar', scheduledDate: today, status: 'idea', body: '' }, { status: 'draft', body: 'Uma pausa para respirar.' }],
    ['goals', { title: 'Alunos ativos', current: 10, target: 30, unit: 'alunos', deadline: today }, { current: 12 }],
  ] as const;
  for (const [collection, payload, changes] of cases) {
    const created = await api.request(`/api/${collection}`, 'POST', payload);
    assert.equal(created.status, 201, collection);
    const record = await created.json();
    const patched = await api.request(`/api/${collection}/${record.id}`, 'PATCH', changes);
    assert.equal(patched.status, 200);
    const updated = await patched.json();
    for (const [field, value] of Object.entries(changes)) assert.equal(updated[field], value);
    assert.equal((await api.request(`/api/${collection}/${record.id}`, 'DELETE')).status, 204);
  }
  const settings = { studioName: 'Meu Studio', ownerName: 'Ana', monthlyRevenueTarget: 12000 };
  assert.equal((await api.request('/api/settings', 'PATCH', settings)).status, 200);
  assert.equal((await api.request('/api/settings', 'PATCH', { monthlyRevenueTarget: -1 })).status, 400);
  const state: StudioState = await (await api.request('/api/state')).json();
  for (const [key,value] of Object.entries(settings)) assert.equal(state.settings[key as keyof typeof settings],value);
  await api.stop();
  const reopened = await running(api.databasePath);
  try {
    const restored: StudioState = await (await reopened.request('/api/state')).json();
    for (const [key,value] of Object.entries(settings)) assert.equal(restored.settings[key as keyof typeof settings],value);
  } finally { await reopened.stop(); }
});

test('local assistant calculates financial guidance from actual records', async t => {
  const api = await fixture(t);
  const initial: StudioState = await (await api.request('/api/state')).json();
  for (const transaction of initial.transactions) {
    assert.equal((await api.request(`/api/transactions/${transaction.id}`, 'DELETE')).status, 204);
  }
  for (const transaction of [
    { type: 'income', amount: 350, status: 'paid', dueDate: today },
    { type: 'expense', amount: 90, status: 'paid', dueDate: today },
    { type: 'income', amount: 175, status: 'pending', dueDate: '2020-01-01' },
    { type: 'income', amount: 9000, status: 'paid', dueDate: '2020-01-01' },
  ]) {
    assert.equal((await api.request('/api/transactions', 'POST', { description: 'Teste de cálculo', category: 'Teste', ...transaction })).status, 201);
  }
  const response = await api.request('/api/assistant', 'POST', { message: 'Como está meu financeiro?' });
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.equal(answer.mode, 'local');
  assert.match(answer.reply, /350,00/);
  assert.match(answer.reply, /90,00/);
  assert.match(answer.reply, /260,00/);
  assert.match(answer.reply, /175,00/);
  assert.doesNotMatch(answer.reply, /9\.000,00/);
  assert.match(answer.reply, /por vencimento/);
  const state: StudioState = await (await api.request('/api/state')).json();
  assert.equal(state.aiConfigured, false);
});

test('assistant validates requests and does not silently accept unusable messages', async t => {
  const api = await fixture(t);
  for (const data of [{}, { message: '' }, { message: 42 }, { message: 'a'.repeat(20001) }]) {
    const response = await api.request('/api/assistant', 'POST', data);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal((await api.request('/api/not-a-collection', 'POST', {})).status, 404);
});

test('local API rejects browser writes from unrelated origins and non-loopback hostnames', async t => {
  const api = await fixture(t);
  const before: StudioState = await (await api.request('/api/state')).json();
  assert.equal((await api.request('/api/students', 'POST', student, { Origin: 'https://unrelated.example' })).status, 403);
  // Fetch normalizes Host; use node:http to exercise a real rebinding request.
  const status = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(`${api.base}/api/state`, { headers: { Host: 'unrelated.example' } }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    req.once('error', reject);
    req.end();
  });
  assert.equal(status, 403);
  const after: StudioState = await (await api.request('/api/state')).json();
  assert.equal(after.students.length, before.students.length);
});

test('assistant aggregates exactly seven calendar days and manual goal progress', () => {
  const seed = seedState();
  const cls = seed.classes[0];
  const state: StudioState = { ...seed, aiConfigured: false, classes: [-1, 0, 6, 7].map((offset, index) => ({ ...cls, id: `boundary-${index}`, date: offsetDate(today, offset) })), goals: [
    { id: 'goal-a', title: 'Meta atingida', current: 12, target: 10, unit: 'aulas', deadline: today },
    { id: 'goal-b', title: 'Meta em andamento', current: 1, target: 10, unit: 'alunos', deadline: today },
  ] };
  const result = metrics(state);
  assert.equal(result.nextSevenDaysClasses, 2);
  assert.equal(result.totalGoals, 2);
  assert.equal(result.achievedGoals, 1);
  assert.equal(result.financialPeriodBasis, 'due_date_of_paid_entries');
});

test('AI integration sends aggregate context, redacts known student details, and exposes provider failures', async t => {
  const state: StudioState = { ...seedState(), aiConfigured: true };
  state.settings.studioMemory = 'Priorizar calendário editorial de três publicações.';
  state.settings.audience = 'Pessoas iniciantes em yoga';
  let sent = '';
  let destination = '';
  const mock = t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    destination = String(url);
    sent = String(init?.body);
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: 'Orientação de teste.' }] }] }), { status: 200 });
  });
  const person = state.students[0];
  const reply = await assistant(`Como acompanhar ${person.name}, e-mail ${person.email}?`, state, 'test-server-key', 'test-model');
  assert.deepEqual(reply, { mode: 'ai', reply: 'Orientação de teste.' });
  assert.equal(destination, 'https://api.openai.com/v1/responses');
  assert.equal(sent.includes(person.name), false);
  assert.equal(sent.includes(person.email), false);
  assert.equal(sent.includes('test-server-key'), false);
  const payload = JSON.parse(sent);
  assert.equal(payload.store, false);
  assert.match(payload.input, /financialPeriodBasis/);
  assert.match(payload.input, /Priorizar calendário editorial/);
  assert.match(payload.input, /Pessoas iniciantes em yoga/);
  mock.mock.mockImplementation(async () => new Response('', { status: 401 }));
  await assert.rejects(assistant('Resumo financeiro', state, 'test-server-key', 'test-model'), /AI_HTTP_401/);
});
