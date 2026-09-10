import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createConsole } from './server.mjs';

async function fixture(t, options={}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b01-console-'));
  fs.mkdirSync(path.join(root, 'story/drafts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'story/posts.json'), JSON.stringify([{ id: 'one', title: '<script>example</script>', date: '2026-09-01', summary: '실제 요약', body: '본문', url: 'one.html' }]));
  fs.writeFileSync(path.join(root, 'story/one.html'), '<h1>one</h1>');
  fs.writeFileSync(path.join(root, 'story/ideas.md'), '- [ ] 새 글감\n- [x] 완료 글감');
  fs.writeFileSync(path.join(root, 'story/drafts/draft.md'), '# 초안 제목\n\n초안 내용');
  const codex = path.join(root, 'mock-codex');
  fs.writeFileSync(codex, String.raw`#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('mock-codex 1'); process.exit(0); }
if (process.argv.includes('login')) process.exit(0);
let prompt = ''; process.stdin.on('data', c => prompt += c); process.stdin.on('end', () => {
const out = x => console.log(JSON.stringify(x));
out({type:'thread.started', thread_id:'test-session'}); out({type:'turn.started'});
if(prompt.includes('ROLE_CONTEXT_TEST')) {out({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({pack:prompt.includes('B01 로컬 편집실 적용 규칙'),mission:prompt.includes('목표:'),schedule:prompt.includes('기존 주간 계획 7개'),role:prompt.includes('판정 기준')||prompt.includes('집필 순서')||prompt.includes('집필 지시서')||prompt.includes('발행 묶음')})}});out({type:'turn.completed'});return;}
if (prompt.includes('HANG')) { setInterval(() => {}, 1000); return; }
if (prompt.includes('FAIL')) { out({type:'turn.failed',error:{message:'Expected test failure'}}); process.exitCode=1; return; }
const file=prompt.match(/story\/drafts\/[a-f0-9-]+\.md/);
if(file) {
  const fs=require('node:fs');
  const writer=prompt.includes('당신은 B01호 블로그의 작가');
  if(writer) fs.writeFileSync(file[0], '# 테스트 초안\n\n확인된 테스트 본문');
  const report={outcome:'ready',summary:'검수 또는 초안 준비 완료',questions:[],checks:writer?[]:Array.from({length:13},(_,i)=>({label:'검수 항목 '+(i+1),status:'pass',evidence:'테스트 확인'})),draftFile:writer?file[0]:null,publishedUrl:null};
  out({type:'item.completed',item:{type:'agent_message',text:'[[PROGRESS:context|자료 확인]] [[DONE:context]]'}});
  setTimeout(()=>{out({type:'item.completed',item:{type:'agent_message',text:'결과\n'+String.fromCharCode(96).repeat(3)+'editorial\n'+JSON.stringify(report)+'\n'+String.fromCharCode(96).repeat(3)}});out({type:'turn.completed'});},80);
  return;
}
if(prompt.includes('QUESTION_TEST')) {
  const report={outcome:'needs_input',summary:'사용자 사실 확인 필요',questions:[{label:'실제 사용한 물건은?',help:'이름을 입력하세요',required:true}],checks:[]};
  out({type:'item.completed',item:{type:'agent_message',text:String.fromCharCode(96).repeat(3)+'editorial\n'+JSON.stringify(report)+'\n'+String.fromCharCode(96).repeat(3)}});out({type:'turn.completed'});return;
}
setTimeout(() => { out({type:'item.completed',item:{type:'agent_message',text:'검증 완료'}}); out({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}); }, 80);
});
`, { mode: 0o700 });
  if(options.publishSuccess){
    fs.writeFileSync(path.join(root,'index.html'),'<link rel="canonical" href="https://example.vercel.app/">');
    let mock=fs.readFileSync(codex,'utf8').replace('확인된 테스트 본문','확인된 테스트 본문 '.repeat(20));
    mock=mock.replace("out({type:'item.completed',item:{type:'agent_message',text:'[[PROGRESS:context|자료 확인]] [[DONE:context]]'}});", `
      if(prompt.includes('당신은 B01호 블로그의 발행 담당')) {
        const title=prompt.match(/글 제목: ([^\\n]+)/)[1];
        const id=file[0].split('/').pop().replace('.md','');
        const html=fs.readFileSync('.editorial-console/previews/'+id+'.html','utf8').replace('</head>','<link rel="canonical" href="https://example.vercel.app/story/published.html"></head>')+'<h1>'+title+'</h1>';
        fs.writeFileSync('story/published.html',html);
        fs.writeFileSync('story/posts.json',JSON.stringify([{title,url:'published.html'}]));
        report.publishedUrl='https://example.vercel.app/story/published.html';
      }
    `);
    fs.writeFileSync(codex,mock);
  }
  const app = createConsole({ root, codex, port: 0, ...(options.notificationTransport?{notificationTransport:options.notificationTransport}:{}), ...(options.publishSuccess?{verifyFetch:async()=>new Response(fs.readFileSync(path.join(root,'story/published.html'),'utf8'))}:{}) });
  const url = await app.start();
  const { token } = await (await fetch(url + '/api/session')).json();
  t.after(() => { app.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const get = async () => (await fetch(url + '/api/state')).json();
  const send = async body => { const res = await fetch(url + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editorial-Token': token }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
  const until = async fn => { for (let i = 0; i < 80; i++) { const s = await get(); if (fn(s)) return s; await new Promise(r => setTimeout(r, 40)); } assert.fail('Timed out'); };
  const post=async(route,body={})=>{const res=await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Editorial-Token':token},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
  return { app, root, url, token, get, send, until, post };
}
test('reads real inventory and picks up subsequent file edits', async t => {
  const f = await fixture(t); const s = await f.get();
  assert.equal(s.posts[0].summary, '실제 요약'); assert.equal(s.posts[0].localPage, true);
  assert.equal(s.drafts[0].title, '초안 제목'); assert.equal(s.ideas.filter(i => !i.done).length, 1);
  fs.writeFileSync(path.join(f.root, 'story/posts.json'), '[]'); assert.equal((await f.get()).posts.length, 0);
  fs.writeFileSync(path.join(f.root, 'story/posts.json'), 'invalid'); assert.ok((await f.get()).errors.length);
});
test('rejects external origins, forged hosts, missing token and invalid commands', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.url + '/api/state', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const forgedHostStatus = await new Promise((resolve, reject) => { http.get(f.url + '/api/session', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject); });
  assert.equal(forgedHostStatus, 403);
  assert.equal((await fetch(f.url + '/api/tasks', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await f.send({ role: 'unknown', prompt: 'test' })).status, 400);
  assert.equal((await f.send({ role: 'editor', prompt: ' ' })).status, 400);
  assert.equal((await f.send({ role: 'editor', prompt: 'test', mode: 'danger-full-access' })).status, 400);
  assert.equal((await fetch(f.url + '/.env')).status, 404);
  assert.equal((await fetch(f.url + '/server.mjs')).status, 404);
});
test('serializes tasks, records both sources, persists results and handles failure', async t => {
  const f = await fixture(t);
  const one = await f.send({ role: 'editor', prompt: '첫 작업', source: 'codex' });
  const two = await f.send({ role: 'writer', prompt: '다음 작업', mode: 'workspace-write' });
  assert.equal(one.status, 201); assert.equal(two.status, 201);
  let s = await f.until(s => s.tasks.length === 2 && s.tasks.every(t => t.status === 'completed'));
  assert.ok(s.tasks[1].startedAt >= s.tasks[0].finishedAt);
  assert.equal(s.tasks[0].source, 'codex'); assert.equal(s.tasks[1].source, 'browser');
  assert.equal(s.tasks[0].result, '검증 완료'); assert.equal(s.tasks[0].sessionId, 'test-session');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, '.editorial-console/tasks.json'))).length, 2);
  const three = await f.send({ role: 'seo', prompt: 'FAIL', parentId: one.body.id }); assert.equal(three.status, 201);
  s = await f.until(s => s.tasks[2].status === 'failed'); assert.equal(s.tasks[2].error, 'Expected test failure');
});
test('cancels running task and continues queued work', async t => {
  const f = await fixture(t); const one = await f.send({ role: 'editor', prompt: 'HANG' });
  await f.send({ role: 'editor', prompt: '다음 작업' });
  const res = await fetch(f.url + '/api/tasks/' + one.body.id + '/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editorial-Token': f.token }, body: '{}' });
  assert.equal(res.status, 200); const s = await f.until(s => s.tasks[1].status === 'completed'); assert.equal(s.tasks[0].status, 'cancelled');
});
test('restores history and marks incomplete jobs interrupted on startup', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b01-recovery-'));
  const dataDir = path.join(root, '.editorial-console'); fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'tasks.json'), JSON.stringify([{ id:'old',status:'running',result:'' },{id:'done',status:'completed',result:'saved'}]));
  const app = createConsole({ root, port: 0, codex: '/nonexistent-codex' }); await app.start();
  t.after(() => { app.stop(); fs.rmSync(root, { recursive:true,force:true }); });
  assert.equal(app.snapshot().tasks[0].status, 'interrupted'); assert.equal(app.snapshot().tasks[1].result, 'saved'); assert.equal(app.snapshot().connection.installed, false);
});

test('creates seven topics, queues only five drafts, and persists question answers', async t=>{
  const f=await fixture(t);
  let r=await f.post('/api/workflow/weeks',{startDate:'2026-09-14'});assert.equal(r.status,200);assert.equal(r.body.articles.length,7);
  assert.deepEqual(r.body.articles.map(a=>a.category),['가구','가구','가구','가구','가구','취미','소비·예산']);
  assert.equal((await f.post('/api/workflow/weeks',{startDate:'2026-09-14'})).status,400);
  const a=r.body.articles[0];
  assert.equal((await f.post(`/api/workflow/articles/${a.id}/approve`)).status,400);
  assert.equal((await f.post(`/api/workflow/articles/${a.id}/schedule`)).status,400);
  r=await f.post('/api/workflow/batch',{week:a.week});assert.equal(r.body.tasks.length,5);
  assert.equal((await f.post(`/api/workflow/articles/${a.id}/save`,{title:'작업 중 수정'})).status,400);
  let s=await f.until(s=>s.tasks.length===5&&s.tasks.every(t=>t.status==='completed'));
  assert.equal(s.articles.filter(a=>a.draftFile).length,5);assert.equal(s.articles.filter(a=>a.status==='needs_input').length,5);
  const answers=Object.fromEntries(a.questions.map(q=>[q.id,'확인한 실제 경험']));
  assert.equal((await f.post(`/api/workflow/articles/${a.id}/answers`,{answers})).status,200);
  assert.equal((await f.get()).articles[0].requiredQuestions,0);
});

test('requires review and photo choice, schedules once, and invalidates changed drafts',async t=>{
  const f=await fixture(t);const created=await f.post('/api/workflow/weeks',{startDate:'2099-09-14'});
  assert.equal(created.status,200);const a=created.body.articles[0],route=`/api/workflow/articles/${a.id}`;
  await f.post(route+'/answers',{answers:Object.fromEntries(a.questions.map(q=>[q.id,'실제 답변']))});
  await f.post(route+'/save',{photoDecision:'none'});
  await f.post(route+'/draft');await f.until(s=>s.articles[0].status==='draft_ready');
  await f.post(route+'/review');await f.until(s=>s.articles[0].status==='reviewed');
  assert.equal((await f.post(route+'/approve')).status,200);
  assert.equal((await f.post(route+'/schedule')).status,200);
  const schedule=(await f.get()).articles[0].scheduledAt;
  f.app.tick(Date.parse(schedule)+7*3600000);assert.equal((await f.get()).articles[0].status,'missed');
  await f.post(route+'/save',{date:'2099-09-15'});await f.post(route+'/schedule');
  fs.appendFileSync(path.join(f.root,`story/drafts/${a.id}.md`),'\n외부 수정');
  f.app.tick(Date.parse((await f.get()).articles[0].scheduledAt));
  const s=await f.get();assert.equal(s.articles[0].status,'failed');assert.match(s.articles[0].error,/원고가 변경/);assert.equal(s.tasks.filter(t=>t.role==='publisher').length,0);
});

test('preserves task questions and resumes only after all required answers',async t=>{
  const f=await fixture(t);const t1=await f.send({role:'editor',prompt:'QUESTION_TEST'});let s=await f.until(s=>s.tasks[0].status==='waiting_input');
  const id=t1.body.id,q=s.tasks[0].questions[0];
  assert.equal((await f.post(`/api/tasks/${id}/continue`)).status,400);
  assert.equal((await f.post(`/api/tasks/${id}/answers`,{answers:{[q.id]:'내 책상'}})).status,200);
  assert.equal((await f.post(`/api/tasks/${id}/continue`)).status,201);
  s=await f.until(s=>s.tasks.length===2&&s.tasks[1].status==='waiting_input');
  assert.equal(s.tasks[0].status,'completed');assert.equal(s.tasks[0].questions[0].answer,'내 책상');
});

test('validates photo uploads and does not accept arbitrary content as photos',async t=>{
  const f=await fixture(t);const {body}=await f.post('/api/workflow/weeks',{startDate:'2026-09-14'});const id=body.articles[0].id;
  assert.equal((await f.post(`/api/workflow/articles/${id}/photos`,{name:'x.svg',data:Buffer.from('<svg/>').toString('base64')})).status,400);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=';
  const r=await f.post(`/api/workflow/articles/${id}/photos`,{name:'직접 촬영.png',data:png});assert.equal(r.status,200);assert.equal(r.body.photoDecision,'attached');
  assert.equal((await fetch(f.url+'/api/assets/'+r.body.images[0].id)).status,200);
  const removed=await f.post(`/api/workflow/articles/${id}/remove-photo`,{id:r.body.images[0].id});assert.equal(removed.body.images.length,0);assert.equal(removed.body.photoDecision,'pending');
});

test('scheduled publication runs once and needs a verified public URL',async t=>{
  const f=await fixture(t);const {body}=await f.post('/api/workflow/weeks',{startDate:'2099-09-14'});const a=body.articles[0],route=`/api/workflow/articles/${a.id}`;
  await f.post(route+'/answers',{answers:Object.fromEntries(a.questions.map(q=>[q.id,'실제 답변']))});await f.post(route+'/save',{photoDecision:'none'});
  await f.post(route+'/draft');await f.until(s=>s.articles[0].status==='draft_ready');
  await f.post(route+'/review');await f.until(s=>s.articles[0].status==='reviewed');
  await f.post(route+'/approve');await f.post(route+'/schedule');const scheduled=(await f.get()).articles[0].scheduledAt;
  f.app.tick(Date.parse(scheduled));f.app.tick(Date.parse(scheduled));
  const s=await f.until(s=>s.articles[0].status==='failed');assert.equal(s.tasks.filter(t=>t.role==='publisher').length,1);assert.match(s.articles[0].error,/발행 성공을 확인하지/);
});

test('reading preview hides metadata and format changes invalidate approval',async t=>{
  const f=await fixture(t);const {body}=await f.post('/api/workflow/weeks',{startDate:'2099-09-14'});const a=body.articles[0],route=`/api/workflow/articles/${a.id}`;
  await f.post(route+'/answers',{answers:Object.fromEntries(a.questions.map(q=>[q.id,'실제 답변']))});await f.post(route+'/save',{photoDecision:'none'});
  await f.post(route+'/draft');await f.until(s=>s.articles[0].status==='draft_ready');
  const file=path.join(f.root,`story/drafts/${a.id}.md`);fs.writeFileSync(file,'---\nsecret: internal-only\n---\n# 제목\n\n**강조** 본문\n두 번째 줄\n\n<!-- 내부 메모 -->');
  await f.post(route+'/review');await f.until(s=>s.articles[0].status==='reviewed');await f.post(route+'/approve');
  assert.equal((await f.post(route+'/format',{format:{emphasis:'highlight',lineBreaks:'source',spacing:'wide'}})).status,200);
  const state=await f.get();assert.equal(state.articles[0].approvedAt,null);assert.equal(state.articles[0].format.emphasis,'highlight');
  const preview=await (await fetch(f.url+'/preview/'+a.id)).text();assert.ok(preview.includes('<strong>강조</strong>'));assert.ok(preview.includes('emphasis-highlight'));assert.ok(!preview.includes('internal-only'));assert.ok(!preview.includes('내부 메모'));
  assert.equal((await f.post(route+'/format',{format:{emphasis:'<script>'}})).status,400);
  assert.equal((await f.post('/api/notifications/'+a.id+'/send')).status,400);
});


test('verified publication remains published when Telegram is not connected',async t=>{
 const f=await fixture(t,{publishSuccess:true});const {body}=await f.post('/api/workflow/weeks',{startDate:'2099-09-14'});const a=body.articles[0],route=`/api/workflow/articles/${a.id}`;
 await f.post(route+'/answers',{answers:Object.fromEntries(a.questions.map(q=>[q.id,'실제 답변']))});await f.post(route+'/save',{photoDecision:'none'});
 await f.post(route+'/draft');await f.until(s=>s.articles[0].status==='draft_ready');await f.post(route+'/review');await f.until(s=>s.articles[0].status==='reviewed');
 await f.post(route+'/approve');await f.post(route+'/schedule');f.app.tick(Date.parse((await f.get()).articles[0].scheduledAt));
 const s=await f.until(s=>['published','failed'].includes(s.articles[0].status));assert.equal(s.articles[0].status,'published',s.articles[0].error);assert.equal(s.articles[0].notification.status,'blocked');assert.equal(s.articles[0].publishedUrl,'https://example.vercel.app/story/published.html');
});


test('all four role requests include adapted AI-OS prompts in actual Codex input',async t=>{
 const f=await fixture(t);
 for(const role of ['editor','writer','seo','publisher'])await f.send({role,prompt:'ROLE_CONTEXT_TEST'});
 const s=await f.until(s=>s.tasks.length===4&&s.tasks.every(t=>t.status==='completed'));
 for(const task of s.tasks)assert.deepEqual(JSON.parse(task.result),{pack:true,mission:true,schedule:true,role:true});
 assert.equal(s.roles.length,4);assert.ok(s.roles.every(r=>r.mission&&r.soul&&r.identity));
});


test('one-hour policy starts at Telegram receipt, can hold, and publishes once after deadline',async t=>{
 const messages=[];const f=await fixture(t,{notificationTransport:async(url,options)=>{if(url.endsWith('/sendMessage'))messages.push(JSON.parse(options.body).text);return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:12,first_name:'테스트'}})};}});
 await f.post('/api/notifications/settings',{botToken:'12345:abcdefghijklmnopqrstuvw',chatId:'123'});await f.post('/api/notifications/check');await f.post('/api/notifications/settings',{enabled:true});await f.post('/api/workflow/publication-policy',{enabled:true});
 const {body}=await f.post('/api/workflow/weeks',{startDate:'2099-09-14'});const a=body.articles[0],route=`/api/workflow/articles/${a.id}`;
 await f.post(route+'/answers',{answers:Object.fromEntries(a.questions.map(q=>[q.id,'실제 답변']))});await f.post(route+'/save',{photoDecision:'none'});await f.post(route+'/draft');await f.until(s=>s.articles[0].status==='draft_ready');await f.post(route+'/review');await f.until(s=>s.articles[0].status==='reviewed');
 assert.equal((await f.post(route+'/publish-now')).status,400);f.app.tick();let s=await f.until(s=>s.articles[0].publicationWindow?.status==='waiting');let w=s.articles[0].publicationWindow;assert.equal(Date.parse(w.deadline)-Date.parse(w.notifiedAt),3600000);assert.equal(messages.length,1);
 await f.post(route+'/hold');f.app.tick(Date.parse(w.deadline)+1);assert.equal((await f.get()).tasks.filter(t=>t.role==='publisher').length,0);
 await f.post(route+'/ask-publication');f.app.tick();s=await f.until(s=>s.articles[0].publicationWindow?.status==='waiting');w=s.articles[0].publicationWindow;
 f.app.tick(Date.parse(w.deadline)-1);assert.equal((await f.get()).tasks.filter(t=>t.role==='publisher').length,0);f.app.tick(Date.parse(w.deadline));f.app.tick(Date.parse(w.deadline));s=await f.until(s=>s.articles[0].status==='failed');assert.equal(s.tasks.filter(t=>t.role==='publisher').length,1);
});

test('rewrite saves partial answers and feedback and queues a grounded draft without requiring every answer',async t=>{
 const {post,get,until}=await fixture(t);
 await post('/api/workflow/weeks',{startDate:'2026-09-14'});
 const a=(await get()).articles[0];
 const result=await post(`/api/workflow/articles/${a.id}/rewrite`,{answers:{[a.questions[0].id]:'책상은 작업용이에요.'},note:'정리법보다 돌아와서 일하는 장면부터 써줘.'});
 assert.equal(result.status,200);
 assert.match(result.body.prompt,/돌아와서 일하는 장면/);
 assert.match(result.body.prompt,/required:false/);
 const state=await until(s=>s.articles[0].status!=='drafting');
 assert.equal(state.articles[0].questions[0].answer,'책상은 작업용이에요.');
 assert.equal(state.articles[0].revision,1);
 assert.equal(state.articles[0].approvedAt,null);
 assert.equal(state.articles[0].draftRevision,1);
});

test('editorial autopilot revises saved answers then reviews without browser approval',async t=>{
 const {post,get,until,app}=await fixture(t);
 await post('/api/workflow/weeks',{startDate:'2026-09-14'});
 const a=(await get()).articles[0];
 await post(`/api/workflow/articles/${a.id}/answers`,{answers:Object.fromEntries(a.questions.map(q=>[q.id,'사용자가 확인한 경험']))});
 await post(`/api/workflow/articles/${a.id}/save`,{photoDecision:'none'});
 await post('/api/workflow/editorial-policy',{enabled:true});
 await post(`/api/workflow/articles/${a.id}/draft`);
 app.tick();
 await until(s=>s.articles[0].status==='draft_ready');
 app.tick();
 const s=await until(s=>s.articles[0].status==='reviewed');
 assert.equal(s.articles[0].approvedAt,null);
 assert.ok(s.articles[0].review);
});

test('Telegram-only approval blocks browser and timeout, accepts one current owner callback',async t=>{
 let updates=[];let messageId=900;
 const {post,get,until,app}=await fixture(t,{notificationTransport:async(url)=>({ok:true,json:async()=>({ok:true,result:url.endsWith('/getUpdates')?updates.splice(0):url.endsWith('/sendMessage')?{message_id:messageId}:{}})})});
 await post('/api/workflow/weeks',{startDate:'2026-09-14'});
 const a=(await get()).articles[0];
 await post(`/api/workflow/articles/${a.id}/answers`,{answers:Object.fromEntries(a.questions.map(q=>[q.id,'확인한 경험']))});
 await post(`/api/workflow/articles/${a.id}/save`,{photoDecision:'none'});
 await post(`/api/workflow/articles/${a.id}/draft`);await until(s=>s.articles[0].status==='draft_ready');
 await post(`/api/workflow/articles/${a.id}/review`);await until(s=>s.articles[0].status==='reviewed');
 await post('/api/notifications/settings',{botToken:'12345:abcdefghijklmnopqrstuvw',chatId:'123'});
 await post('/api/notifications/check');await post('/api/notifications/settings',{remoteApproval:true,enabled:true});
 await post('/api/workflow/publication-policy',{enabled:true,requireTelegramApproval:true});
 app.tick();await until(s=>s.articles[0].publicationWindow?.status==='waiting');
 assert.equal((await get()).articles[0].publicationWindow.deadline,null);
 assert.notEqual((await post(`/api/workflow/articles/${a.id}/publish-now`)).status,200);
 app.tick(Date.now()+86400000);await new Promise(r=>setTimeout(r,100));
 assert.equal((await get()).tasks.filter(t=>t.role==='publisher').length,0);
 updates=[{update_id:1,callback_query:{id:'q1',from:{id:123},message:{chat:{id:123},message_id:messageId},data:`b01:publish:${a.id}`}}];
 app.tick();await until(s=>s.tasks.some(t=>t.role==='publisher'));
 app.tick();assert.equal((await get()).tasks.filter(t=>t.role==='publisher').length,1);
 await until(s=>s.articles[0].status==='failed');
 await new Promise(r=>setTimeout(r,100));
});
