import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server/app.ts';

const dir = await mkdtemp(join(tmpdir(), 'studio-browser-'));
const { app, close } = createApp({ databasePath: join(dir, 'test.sqlite'), aiApiKey: '', seedDemo: true, appPin: '2468' });
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function state() { return (await page.request.get(`${base}/api/state`)).json(); }
async function go(id) { await page.goto(`${base}/#${id}`); await page.locator('main h1').waitFor(); }
async function save(label) { await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
try {
  await page.goto(base); await page.getByLabel('PIN de acesso').fill('2468');
  await page.getByRole('button',{name:'Entrar no studio'}).click();
  await page.getByRole('heading',{name:/Olá, Marina/}).waitFor();
  await go('overview');
  assert.match(await page.locator('main h1').innerText(), /Marina/);
  await go('students');
  await page.getByRole('button', { name: 'Novo aluno', exact: true }).click();
  await page.getByLabel('Nome completo').fill('Teste Navegador');
  await page.getByLabel('E-mail', { exact: true }).fill('navegador@example.com');
  await page.getByLabel('Telefone / WhatsApp', { exact: true }).fill('11999998888');
  await save('Salvar aluno');
  await page.getByLabel('Buscar aluno', { exact: true }).fill('Teste Navegador');
  await page.getByRole('button', { name: 'Editar Teste Navegador', exact: true }).click();
  await page.getByLabel('Mensalidade (R$)', { exact: true }).fill('275');
  await save('Salvar aluno');
  let current = await state();
  const student = current.students.find(item => item.name === 'Teste Navegador');
  assert.equal(student.monthlyFee, 275);
  console.log('PASS cadastro, busca e edição de aluno');

  await go('schedule');
  await page.getByRole('button', { name: 'Nova aula', exact: true }).click();
  await page.getByLabel('Nome da aula').fill('Aula teste navegador');
  await page.getByLabel('Capacidade de alunos').fill('1');
  await page.getByRole('checkbox', { name: 'Teste Navegador', exact: true }).check();
  assert.equal(await page.getByRole('checkbox', { name: 'Ana Martins', exact: true }).isDisabled(), true);
  await save('Salvar aula');
  current = await state();
  const yogaClass = current.classes.find(item => item.title === 'Aula teste navegador');
  assert.deepEqual(yogaClass.studentIds, [student.id]);
  console.log('PASS criação de aula e limite de vagas no navegador');

  await go('finance');
  await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
  await page.getByLabel('Descrição', { exact: true }).fill('Mensalidade teste navegador');
  await page.getByLabel('Valor (R$)', { exact: true }).fill('275');
  await page.getByLabel('Aluno vinculado (opcional)').selectOption(student.id);
  await save('Salvar lançamento');
  await page.getByRole('button', { name: 'Confirmar Mensalidade teste navegador', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar Mensalidade teste navegador', exact: true }).waitFor({ state: 'hidden' });
  assert.equal((await state()).transactions.find(item => item.description === 'Mensalidade teste navegador').status, 'paid');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const file = await downloaded;
  assert.match(file.suggestedFilename(), /^financeiro-\d{4}-\d{2}\.csv$/);
  console.log('PASS recebimento confirmado e exportação financeira');

  await go('students');
  await page.getByRole('button', { name: 'Excluir Teste Navegador', exact: true }).click();
  await save('Excluir aluno');
  current = await state();
  assert.equal(current.students.some(item => item.id === student.id), false);
  assert.equal(current.classes.find(item => item.id === yogaClass.id).studentIds.length, 0);
  assert.equal(current.transactions.find(item => item.description === 'Mensalidade teste navegador').studentId, undefined);
  console.log('PASS exclusão preserva financeiro e remove inscrição');

  await go('content');
  await page.getByLabel('Nome do contato', { exact: true }).fill('Pessoa Exemplo');
  await page.getByLabel('WhatsApp no Brasil (com DDD)', { exact: true }).fill('(11) 99999-8888');
  assert.match(await page.getByLabel('Mensagem para revisar e personalizar').inputValue(), /Olá, Pessoa!/);
  await page.evaluate(() => { window.open = url => { window.__draftUrl = String(url); return null; }; });
  await page.getByRole('button', { name: 'Abrir conversa no WhatsApp', exact: true }).click();
  const draftUrl = new URL(await page.evaluate(() => window.__draftUrl));
  assert.equal(draftUrl.hostname, 'wa.me');
  assert.equal(draftUrl.pathname, '/5511999998888');
  assert.match(draftUrl.searchParams.get('text'), /Studio Aurora/);
  await page.getByRole('button', { name: 'Lembrar de retornar', exact: true }).click();
  await page.getByRole('button', { name: 'Lembrete criado', exact: true }).waitFor();
  assert.equal((await state()).tasks.filter(t => t.title.includes('Retomar contato com Pessoa Exemplo')).length, 1);
  await page.getByRole('tab', { name: 'Calendário de conteúdo', exact: true }).click();
  const beforePlan = (await state()).content.length;
  await page.getByRole('button', { name: 'Planejar 3 conteúdos', exact: true }).click();
  await page.getByRole('button', { name: 'Plano já criado', exact: true }).waitFor();
  assert.equal((await state()).content.length, beforePlan + 3);
  assert.equal(await page.getByRole('button', { name: 'Plano já criado', exact: true }).isDisabled(), true);
  console.log('PASS rascunho WhatsApp sem envio, lembrete e plano editorial sem duplicação');

  await go('assistant');
  await page.getByRole('button', { name: 'Prepare uma mensagem para um interessado' }).click();
  await page.locator('.chat-message.assistant').waitFor();
  assert.match(await page.locator('.chat-message.assistant').innerText(), /Análise local/);
  assert.match(await page.locator('.chat-message.assistant').innerText(), /Modelo de acolhimento/);
  console.log('PASS assistente local com modelo de comunicação');

  await go('settings');
  await page.getByLabel('Nome do studio',{exact:true}).fill('Studio de teste compartilhado');
  await page.getByLabel('O que o assistente precisa saber sobre o studio?').fill('Prioridade: conteúdo para iniciantes, três publicações por semana.');
  const settingsSaved=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PATCH');
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();assert.equal((await settingsSaved).status(),200);
  const second=await browser.newContext();const secondPage=await second.newPage();await secondPage.goto(base+'/#settings');
  await secondPage.getByLabel('PIN de acesso').fill('2468');await secondPage.getByRole('button',{name:'Entrar no studio'}).click();
  await secondPage.getByLabel('Nome do studio',{exact:true}).waitFor();
  assert.equal(await secondPage.getByLabel('Nome do studio',{exact:true}).inputValue(),'Studio de teste compartilhado');
  assert.match(await secondPage.getByLabel('O que o assistente precisa saber sobre o studio?').inputValue(),/iniciantes/);
  await secondPage.getByRole('button',{name:'Sair do studio'}).click();await secondPage.getByLabel('PIN de acesso').waitFor();
  assert.equal((await secondPage.request.get(base+'/api/state')).status(),401);await second.close();
  console.log('PASS PIN, configurações e memória compartilhadas entre dois navegadores independentes; logout protege API');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['overview', 'students', 'schedule', 'finance', 'routine', 'content', 'growth', 'assistant', 'settings']) {
    await go(id);
    const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(dimensions.content <= dimensions.viewport, `${id}: overflow ${dimensions.content}/${dimensions.viewport}`);
  }
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Alunos', exact: true }).click();
  await page.getByRole('heading', { name: 'Seus alunos', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Fechar menu', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS nove telas em celular, menu acessível e nenhum erro JavaScript');
} catch (error) {
  await page.screenshot({ path: '/tmp/studio-browser-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  close();
  await rm(dir, { recursive: true, force: true });
}
