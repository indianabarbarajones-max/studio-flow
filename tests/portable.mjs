import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({offline:true,viewport:{width:1280,height:900}});
// The managed Chromium policy blocks file://. Fulfill only the standalone document
// from disk at a local test URL; all other network access remains offline.
const url='http://127.0.0.1:3199/Studio-Flow-Abrir.html';
const html=await readFile(resolve('.data/Studio-Flow-Abrir.html'),'utf8');
await context.route(url,route=>route.fulfill({status:200,contentType:'text/html',body:html}));
const page=await context.newPage();
const errors=[];const requests=[];
page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()) && request.url()!==url)requests.push(request.url());});
const state=()=>page.evaluate(async()=> (await fetch('/api/state')).json());
const api=(path,method,data)=>page.evaluate(async({path,method,data})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:r.status,body:r.status===204?null:await r.json()};},{path,method,data});
try{
 await page.goto(url);await page.getByRole('heading',{name:/Seu dia no studio/}).waitFor();
 assert.equal((await state()).storage,'browser');assert.equal((await state()).aiConfigured,false);
 await page.getByRole('navigation').getByRole('button',{name:'Alunos',exact:true}).click();
 await page.getByRole('button',{name:'Novo aluno',exact:true}).click();
 await page.getByLabel('Nome completo').fill('Pessoa Portable');
 await page.getByRole('button',{name:'Salvar aluno',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 let student=(await state()).students.find(s=>s.name==='Pessoa Portable');assert.ok(student);
 await page.reload();await page.locator('main h1').waitFor();assert.ok((await state()).students.some(s=>s.id===student.id));
 assert.equal((await api('/api/students/'+student.id,'PATCH',{monthlyFee:285})).body.monthlyFee,285);
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const cls=await api('/api/classes','POST',{title:'Aula portable',date,startTime:'08:00',duration:60,capacity:1,instructor:'Teste',studentIds:[student.id]});assert.equal(cls.status,201);
 assert.equal((await api('/api/classes/'+cls.body.id,'PATCH',{studentIds:[student.id,'student-1']})).status,400);
 const tx=await api('/api/transactions','POST',{description:'Receita portable',category:'Teste',type:'income',amount:285,dueDate:date,status:'paid',studentId:student.id});assert.equal(tx.status,201);
 await api('/api/students/'+student.id,'DELETE');
 let current=await state();assert.equal(current.classes.find(c=>c.id===cls.body.id).studentIds.length,0);assert.equal(current.transactions.find(t=>t.id===tx.body.id).studentId,undefined);
 const assistant=await api('/api/assistant','POST',{message:'Prepare uma mensagem de cobrança'});assert.equal(assistant.body.mode,'local');assert.match(assistant.body.reply,/Modelo de lembrete/);
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('QuotaExceededError');};});
 assert.equal((await api('/api/settings','PATCH',{studioName:'Não deve salvar'})).status,400);assert.equal((await state()).settings.studioName,'Meu Studio');
 await page.reload();await page.locator('main h1').waitFor();assert.equal((await state()).settings.studioName,'Meu Studio');
 await page.setViewportSize({width:390,height:844});await page.goto(url+'#overview');await page.locator('main h1').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log('PASS HTML offline: abertura, cadastro/edição/exclusão, persistência, vagas, vínculos, assistente local, falha de gravação e celular; nenhuma dependência externa de rede.');
 const blocked=await browser.newContext({offline:true});await blocked.route(url,route=>route.fulfill({status:200,contentType:'text/html',body:html}));await blocked.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('SecurityError');};});const bp=await blocked.newPage();await bp.goto(url);await bp.locator('main h1').waitFor();assert.match(await bp.locator('.demo-banner').innerText(),/alterações não serão salvas/);await blocked.close();
 await page.evaluate(()=>localStorage.setItem('studio-flow-portable-v2','corrupted'));await page.reload();await page.getByRole('heading',{name:'Vamos reconectar seu studio'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('studio-flow-portable-v2')),'corrupted');
 console.log('PASS armazenamento bloqueado explícito e dados ilegíveis preservados.');
}finally{await browser.close();}
