import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const { url, token } = JSON.parse(fs.readFileSync(path.join(root, '.editorial-console/connection.json'), 'utf8'));
  const [command = 'status', ...args] = process.argv.slice(2);
  let route = '/api/state', body;
  if (command === 'send') { const [role, ...words] = args; const write = words.includes('--write'); body = { role, prompt: words.filter(w => w !== '--write').join(' '), mode: write ? 'workspace-write' : 'read-only', source: 'codex' }; route = '/api/tasks'; }
  else if (command === 'cancel') { route = `/api/tasks/${encodeURIComponent(args[0])}/cancel`; body = {}; }
  else if (command === 'week') {route='/api/workflow/weeks';body={startDate:args[0]};}
  else if (command === 'batch') {route='/api/workflow/batch';body={week:args[0]};}
  else if (command === 'action') {if(!['draft','review','approve','schedule','unschedule'].includes(args[1]))throw new Error('지원하지 않는 단계입니다.');route=`/api/workflow/articles/${encodeURIComponent(args[0])}/${args[1]}`;body={};}
  else if (command === 'edit') {route=`/api/workflow/articles/${encodeURIComponent(args[0])}/save`;body=JSON.parse(args.slice(1).join(' '));}
  else if (command === 'answer') {route=`/api/workflow/articles/${encodeURIComponent(args[0])}/answers`;body={answers:{[args[1]]:args.slice(2).join(' ')}};}
  else if (command === 'task-answer') {route=`/api/tasks/${encodeURIComponent(args[0])}/answers`;body={answers:{[args[1]]:args.slice(2).join(' ')}};}
  else if (command === 'continue') {route=`/api/tasks/${encodeURIComponent(args[0])}/continue`;body={source:'codex'};}
  else if (!['status', 'tasks','articles','article'].includes(command)) throw new Error('사용법: status | tasks | articles | article ID | week YYYY-MM-DD | batch WEEK | action ID draft|review|approve|schedule|unschedule | edit ID JSON | answer ID 질문ID 답변 | task-answer ID 질문ID 답변 | continue ID | send ROLE "명령" [--write] | cancel ID');
  if(body)body.source='codex';
  const response = await fetch(url + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Editorial-Token': token }, body: body ? JSON.stringify(body) : undefined });
  let result = await response.json(); if (!response.ok) throw new Error(result.error);
  if (command === 'status') result = { connection: result.connection, posts: result.posts.length, drafts: result.drafts.length, ideas: result.ideas.filter(i => !i.done).length, articles:(result.articles||[]).map(({id,title,status,next,requiredQuestions})=>({id,title,status,next,requiredQuestions})), tasks: result.tasks.map(({ id, role, status, prompt, result, error,progress,questions }) => ({ id, role, status, prompt, result, error,progress,questions })) };
  if (command === 'tasks') result = result.tasks;
  if (command === 'articles') result=result.articles;
  if (command === 'article') {result=result.articles.find(a=>a.id===args[0]);if(!result)throw new Error('글이 없습니다.');}
  console.log(JSON.stringify(result, null, 2));
} catch (err) { console.error(`편집실 연결 오류: ${err.message}\n서버 실행: node local-console/server.mjs`); process.exitCode = 1; }
