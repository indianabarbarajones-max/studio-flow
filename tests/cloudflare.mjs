import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare, createFetchMock } from 'miniflare';
import { chromium } from 'playwright';

const dir = await mkdtemp(join(tmpdir(), 'studio-cloudflare-'));
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
const pin = '2468';
const origin = 'https://studio.example';
let runtime;
let browser;

function start(bindings = {}, fetchMock) {
  return new Miniflare({
    modules: true,
    scriptPath: resolve('.data/cloudflare-build/index.js'),
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    bindings: { ...config.vars, APP_PIN: pin, ...bindings },
    durableObjects: { STUDIO: { className: 'Studio', useSQLite: true } },
    durableObjectsPersist: join(dir, 'storage'),
    ...(fetchMock ? { fetchMock } : {}),
    assets: {
      directory: resolve(config.assets.directory), binding: config.assets.binding,
      routerConfig: { has_user_worker: true, static_routing: { user_worker: config.assets.run_worker_first } },
      assetConfig: { not_found_handling: config.assets.not_found_handling, has_static_routing: true },
    },
  });
}
async function request(path, method = 'GET', body, cookie = '', headers = {}) {
  return runtime.dispatchFetch(origin + path, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, 'CF-Connecting-IP': '192.0.2.10', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
async function login(value = pin, headers = {}) {
  const response = await request('/api/auth/login', 'POST', { pin: value }, '', headers);
  return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}
async function state(cookie) { const response = await request('/api/state', 'GET', undefined, cookie); assert.equal(response.status, 200); return response.json(); }

try {
  runtime = start();
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/')).status, 200);
  for (const [path, method] of [['/api/state','GET'], ['/api/settings','PATCH'], ['/api/integrations','GET'], ['/api/assistant','POST'], ['/api/tasks','POST']]) {
    assert.equal((await request(path, method)).status, 401, path);
  }
  assert.equal((await request('/api/state', 'GET', undefined, '', { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' })).status, 401, 'API navigation must never fall through to SPA HTML');
  const first = await login();
  assert.equal(first.response.status, 200);
  const setCookie = first.response.headers.get('set-cookie');
  for (const flag of ['__Host-studio_session=', 'Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(setCookie.includes(flag));
  const cookie = first.cookie;
  const empty = await state(cookie);
  assert.equal(empty.demo, false);
  for (const key of ['students','classes','tasks','content','transactions','goals']) assert.equal(empty[key].length, 0);
  assert.equal((await request('/api/state', 'GET', undefined, '__Host-studio_session='+'0'.repeat(64))).status, 401);
  console.log('PASS Cloudflare: PIN no servidor, cookies seguros, base vazia e APIs protegidas');

  assert.equal((await request('/api/settings','PATCH',{ studioName: 'Studio compartilhado', studioMemory: 'Tom acolhedor e sem promessas.' },cookie)).status, 200);
  assert.equal((await request('/api/settings','PATCH',{ studioName: 'Não deve salvar' },cookie,{ Origin:'https://unrelated.example' })).status,403);
  assert.equal((await request('/api/settings','PATCH',{ studioName: 'Não deve salvar' },cookie,{ 'Sec-Fetch-Site':'cross-site' })).status,403);
  assert.equal((await request('/api/settings','PATCH','{invalid',cookie)).status,400);
  assert.equal((await request('/api/settings','PATCH',{ studioMemory:'a'.repeat(70000) },cookie)).status,413);
  assert.equal((await request('/api/settings','PATCH',{ appPin:'1111' },cookie)).status,400);
  const taskResponse = await request('/api/tasks','POST',{title:'Revisar conteúdo da semana', area:'Marketing', dueDate:'2026-10-29', done:false},cookie);
  assert.equal(taskResponse.status,201);
  const task = await taskResponse.json();
  assert.equal((await request(`/api/tasks/${task.id}`,'PATCH',{done:true},cookie)).status,200);
  const second = await login();
  assert.equal((await state(second.cookie)).tasks[0].done,true);
  assert.equal((await state(second.cookie)).settings.studioName,'Studio compartilhado');
  const reply = await request('/api/assistant','POST',{message:'Ajude com divulgação e conteúdo'},cookie);
  assert.equal(reply.status,200);
  assert.equal((await reply.json()).mode,'local');
  console.log('PASS Cloudflare: validação, proteção de origem, rotina e dados compartilhados');

  const studentResponse = await request('/api/students','POST',{name:'Aluna teste',email:'',phone:'',plan:'Mensal',monthlyFee:180,status:'active',renewalDate:'2026-11-01'},cookie);
  assert.equal(studentResponse.status,201);
  const student = await studentResponse.json();
  const cls = {title:'Yoga teste',date:'2026-10-30',startTime:'08:00',duration:60,capacity:1,instructor:'Equipe',studentIds:[student.id]};
  assert.equal((await request('/api/classes','POST',{...cls,syncToGoogle:true},cookie)).status,400);
  assert.equal((await request('/api/classes','POST',{...cls,studentIds:[student.id,student.id]},cookie)).status,400);
  assert.equal((await request('/api/classes','POST',cls,cookie)).status,201);
  assert.equal((await request('/api/transactions','POST',{description:'Mensalidade teste',category:'Mensalidades',type:'income',amount:180,dueDate:'2026-10-30',status:'pending',studentId:student.id},cookie)).status,201);
  assert.equal((await request(`/api/students/${student.id}`,'DELETE',undefined,cookie)).status,204);
  const afterDelete = await state(cookie);
  assert.equal(afterDelete.classes[0].studentIds.length,0);
  assert.equal(afterDelete.transactions[0].studentId,undefined);
  const integration = await (await request('/api/integrations','GET',undefined,cookie)).json();
  assert.equal(integration.google.configured,false);
  assert.equal(integration.ai.configured,false);
  assert.equal((await request('/api/not-found','GET',undefined,cookie)).status,404);
  console.log('PASS Cloudflare: relações preservadas e Google bloqueado até conexão real');

  await runtime.dispose();
  runtime = start();
  assert.equal((await state(cookie)).settings.studioMemory,'Tom acolhedor e sem promessas.');
  assert.equal((await state(cookie)).tasks[0].id,task.id);
  assert.equal((await request('/api/auth/logout','POST',{},cookie)).status,200);
  assert.equal((await request('/api/state','GET',undefined,cookie)).status,401);
  assert.equal((await request('/api/state','GET',undefined,second.cookie)).status,200);
  for (let i=0;i<6;i++) assert.equal((await login('000000',{ 'CF-Connecting-IP':'192.0.2.99' })).response.status,401);
  let limited = (await login(pin,{ 'CF-Connecting-IP':'192.0.2.99' })).response;
  assert.equal(limited.status,429);
  assert.ok(Number(limited.headers.get('retry-after'))>0);
  await runtime.dispose(); runtime=start();
  assert.equal((await login(pin,{ 'CF-Connecting-IP':'192.0.2.99' })).response.status,429);
  console.log('PASS Cloudflare: dados, sessões e limite de tentativas sobrevivem ao reinício');

  const googleEnv = { GOOGLE_CLIENT_ID:'test-client-id', GOOGLE_CLIENT_SECRET:'test-client-secret' };
  const mock = createFetchMock(); mock.disableNetConnect();
  mock.get('https://oauth2.googleapis.com').intercept({method:'POST',path:'/token'}).reply(200,{access_token:'test-access-token',refresh_token:'test-refresh-token',token_type:'Bearer',expires_in:3600});
  mock.get('https://www.googleapis.com').intercept({method:'GET',path:/^\/calendar\/v3\/calendars\/primary\/events\/[a-f0-9]+$/}).reply(404,{});
  let readRemoteEvent;
  mock.get('https://www.googleapis.com').intercept({method:'POST',path:'/calendar/v3/calendars/primary/events?sendUpdates=none'}).reply(200,options=>{readRemoteEvent=new Response(options.body).json();return {id:'test-event-id'};});
  await runtime.dispose(); runtime=start(googleEnv,mock);
  const connect=await request('/api/integrations/google/connect','GET',undefined,second.cookie);
  assert.equal(connect.status,302);
  const authorization=new URL(connect.headers.get('location'));
  assert.equal(authorization.hostname,'accounts.google.com');
  const callback=await request('/api/integrations/google/callback?code=test-code&state='+authorization.searchParams.get('state'),'GET',undefined,second.cookie);
  assert.equal(callback.status,302);
  assert.equal(callback.headers.get('location'),'/?google=connected#settings');
  const opted=await request('/api/classes','POST',{...cls,studentIds:[],syncToGoogle:true},second.cookie);
  assert.equal(opted.status,201);
  const synced=await opted.json();
  assert.equal(synced.googleSyncStatus,'synced',JSON.stringify({error:synced.googleSyncError,pending:mock.pendingInterceptors().map(item=>({method:item.method,path:String(item.path)}))}));
  assert.equal((await readRemoteEvent).summary,cls.title);
  const noNetwork=createFetchMock();noNetwork.disableNetConnect();
  await runtime.dispose();runtime=start(googleEnv,noNetwork);
  const persistedIntegration=await request('/api/integrations','GET',undefined,second.cookie);
  assert.equal((await persistedIntegration.json()).google.connected,true);
  const persisted=await state(second.cookie);
  assert.equal(persisted.classes.find(item=>item.id===synced.id).googleSyncStatus,'synced');
  assert.equal(JSON.stringify(persisted).includes('test-refresh-token'),false);
  assert.equal(JSON.stringify(persisted).includes('test-client-secret'),false);
  console.log('PASS Cloudflare: OAuth e evento simulados; tokens criptografados persistem sem arquivos locais');

  // Real Chromium accesses the local Workers runtime, with two independent cookie jars.
  const local = await runtime.ready;
  browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox'] });
  const contexts = await Promise.all([browser.newContext(),browser.newContext({viewport:{width:390,height:844}})]);
  const pages = await Promise.all(contexts.map(context=>context.newPage()));
  const errors=[];
  for (const page of pages) {
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(local.href);
    await page.getByLabel('PIN de acesso').fill(pin);
    await page.getByRole('button',{name:'Entrar no studio'}).click();
    await page.locator('main h1').waitFor();
  }
  await pages[0].request.patch(new URL('/api/settings',local).href,{data:{studioName:'Studio em dois dispositivos'}});
  const browserState=await (await pages[1].request.get(new URL('/api/state',local).href)).json();
  assert.equal(browserState.settings.studioName,'Studio em dois dispositivos');
  for (const id of ['overview','routine','content','schedule','students','finance','growth','assistant','settings']) {
    await pages[1].goto(new URL('/#'+id,local).href);
    await pages[1].locator('main h1').waitFor();
    assert.ok(await pages[1].evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),id);
  }
  assert.deepEqual(errors,[]);
  await browser.close(); browser=undefined;
  console.log('PASS Cloudflare: login em dois navegadores e nove telas no celular sem erros');

  await runtime.dispose();runtime=start({APP_PIN:'8642'});
  assert.equal((await request('/api/state','GET',undefined,second.cookie)).status,401);
  assert.equal((await login('8642')).response.status,200);
  await runtime.dispose();runtime=start({APP_PIN:''});
  assert.equal((await request('/api/auth/login','POST',{pin})).status,503);
  console.log('PASS Cloudflare: troca de PIN revoga sessões e ausência de segredo bloqueia entrada');
} finally {
  await browser?.close();
  await runtime?.dispose();
  await rm(dir,{recursive:true,force:true});
}
