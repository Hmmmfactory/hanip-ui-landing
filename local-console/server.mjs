import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { refreshDraftQuestions, conversationBrief, STAGES, readReport, taskProgress, createWeek, articleStatus, workflowStore } from './workflow.mjs';

import {readDraft, normalizeFormat, readingClass, readingCss, escapeHtml} from './reading.mjs';
import {createNotifications, notificationText} from './notifications.mjs';
import {createPublicationWindow,acceptPublicationNotice,publicationDue} from './publication-window.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
function installedCodex() {
  if (process.env.EDITORIAL_CODEX_BIN) return process.env.EDITORIAL_CODEX_BIN;
  for (const candidate of ['/Applications/ChatGPT.app/Contents/Resources/codex', '/Applications/Codex.app/Contents/Resources/codex']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'codex';
}
import {roles, roleInstruction} from './roles.mjs';
export {roles};

export function createConsole({ root = path.resolve(here, '..'), dataDir = path.join(root, '.editorial-console'), codex = installedCodex(), verifyFetch = fetch, notificationTransport = fetch, port = Number(process.env.EDITORIAL_PORT || 4317) } = {}) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const stateFile = path.join(dataDir, 'tasks.json');
  const workflow = workflowStore(dataDir);
  const notifications = createNotifications(dataDir,{transport:notificationTransport});
  for(const a of workflow.data.articles) if(a.notification?.status==='sending') a.notification={...a.notification,status:'unknown',error:'서버 재시작으로 전달 결과가 불확실합니다. 텔레그램을 확인하세요.'};
  for(const a of workflow.data.articles)if(a.publicationWindow?.status==='requesting')a.publicationWindow={...a.publicationWindow,status:'unknown',error:'서버 재시작으로 발행 확인 알림의 전달 여부가 불확실합니다. 확인 후 다시 요청하세요.'};
  let tasks = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : [];
  for (const task of tasks) if (['running', 'queued'].includes(task.status)) {
    task.status = 'interrupted'; task.error = '서버가 재시작되었습니다. 새 명령으로 다시 실행하세요.';
  }
  const token = randomBytes(32).toString('hex');
  let active = null, closing = false;
  const save = () => { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(tasks, null, 2), { mode: 0o600 }); fs.renameSync(stateFile + '.tmp', stateFile); };
  save();
  const version = spawnSync(codex, ['--version'], { encoding: 'utf8', timeout: 5000 });
  const login = spawnSync(codex, ['login', 'status'], { encoding: 'utf8', timeout: 5000 });
  const connection = { installed: version.status === 0, authenticated: login.status === 0, version: version.status === 0 ? version.stdout.trim() : null };
  const draftHash = a => a.draftFile && fs.existsSync(path.join(root,a.draftFile)) ? createHash('sha256').update(fs.readFileSync(path.join(root,a.draftFile))).update(JSON.stringify(normalizeFormat(a.format))).digest('hex') : null;
  const hasPlaceholders = a => !a.draftFile || !fs.existsSync(path.join(root,a.draftFile)) || /\[확인\s*필요|\[미확인|\bTODO\b/.test(fs.readFileSync(path.join(root,a.draftFile),'utf8'));
  let publishOrigin=null;
  try {const canonical=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1];if(canonical)publishOrigin=new URL(canonical).origin;}catch{}
  let scheduler;
  for (const a of workflow.data.articles) if (['drafting','reviewing','publishing'].includes(a.status)) { a.status = 'failed'; a.error = '서버 재시작으로 작업이 중단되었습니다. 기록을 확인하고 다시 요청하세요.'; }
  workflow.save();

  function library() {
    const errors = [];
    let posts = [], ideas = [], drafts = [];
    try { posts = JSON.parse(fs.readFileSync(path.join(root, 'story/posts.json'), 'utf8')).map(p => ({ ...p, localPage: !!p.url && !p.url.includes('..') && fs.existsSync(path.join(root, 'story', p.url)) })); }
    catch { errors.push('글 목록을 읽지 못했습니다. story/posts.json을 확인하세요.'); }
    try { ideas = fs.readFileSync(path.join(root, 'story/ideas.md'), 'utf8').split('\n').flatMap((line, i) => { const m = line.match(/^- \[([ x])\] (.+)$/i); return m ? [{ id: String(i), title: m[2], done: m[1].toLowerCase() === 'x' }] : []; }); }
    catch { errors.push('글감 목록을 읽지 못했습니다.'); }
    const dir = path.join(root, 'story/drafts');
    if (fs.existsSync(dir)) drafts = fs.readdirSync(dir).filter(f => /\.md$/i.test(f) && fs.lstatSync(path.join(dir, f)).isFile()).map(f => {
      const body = fs.readFileSync(path.join(dir, f), 'utf8');
      return { id: f, title: body.match(/^#\s+(.+)$/m)?.[1] || f, body, reading:readDraft(body,publishOrigin), summary:readDraft(body,publishOrigin).summary, date: fs.statSync(path.join(dir, f)).mtime.toISOString().slice(0, 10) };
    });
    return { posts, ideas, drafts, errors };
  }
  const snapshot = () => ({ editorialPolicy:workflow.data.editorialPolicy||{enabled:false}, publicationPolicy:workflow.data.publicationPolicy||{enabled:false,delayMinutes:60}, notifications:notifications.status(), roles: roles.map(({ instruction, ...r }) => r), connection, tasks: tasks.map(t => ({...t,progress:taskProgress(t)})), articles:workflow.data.articles.map(a => articleStatus(a,tasks)), scheduler:{mode:'local',timezone:'Asia/Seoul',running:!!scheduler,lateWindowHours:6}, ...library(), updatedAt: new Date().toISOString() });
  function event(task, text) { task.lastEventAt = new Date().toISOString(); task.events.push({ at: task.lastEventAt, text: String(text).slice(0, 1800) }); task.events = task.events.slice(-120); save(); }
  function runNext() {
    if (active || closing) return;
    const task = tasks.find(t => t.status === 'queued');
    if (!task) return;
    const role = roles.find(r => r.id === task.role);
    if(task.articleId && task.role==='publisher') {
      const a=article(task.articleId);
      if(!a.approvedAt || a.review?.draftHash!==draftHash(a) || hasPlaceholders(a) || workflow.data.publicationPolicy?.enabled && a.publicationWindow?.status!=='publishing') { task.status='failed';task.error='승인 후 원고가 변경되었거나 확인 필요 문구가 남아 있습니다. 다시 검수하고 승인하세요.';a.status='changes_requested';a.approvedAt=null;save();workflow.save();runNext();return; }
    }
    task.status = 'running'; task.startedAt = new Date().toISOString(); save();
    const previous = task.parentId && tasks.find(t => t.id === task.parentId);
    const protocol = `진행을 사용자가 볼 수 있도록 단계 시작 시 [[PROGRESS:단계ID|지금 확인할 구체적인 대상]]을, 완료 시 [[DONE:단계ID]]를 commentary로 출력하세요. 단계는 ${JSON.stringify(STAGES[task.role])} 입니다. 추정 퍼센트는 만들지 마세요. 최종 응답에는 간단한 한국어 요약 후 반드시 다음 형태의 editorial 코드 블록 하나를 포함하세요. \n\`\`\`editorial\n{"outcome":"ready 또는 needs_input 또는 changes_requested","summary":"완료한 일과 다음 행동","questions":[{"label":"실제 필요한 질문","help":"왜 필요한지와 답하는 방법","example":"답변 예시","required":true}],"checks":[{"label":"검수 항목","status":"pass 또는 fail 또는 na","evidence":"확인한 근거"}],"draftFile":null,"publishedUrl":null}\n\`\`\`\n질문은 미확인 사실에 대해서만 최대 10개로 묶으세요. 추측으로 답하지 마세요. SEO 검수는 스킬 13개 항목을 모두 반환하고 확인하지 못했거나 수정이 필요하면 fail로 남기세요. 초안은 story/drafts/ 경로를 draftFile로 반환하세요. 공개 URL은 실제 배포와 검증을 했을 때만 반환하세요. 결과 내용에 JSON 예시를 중복하지 마세요.`;
    const prompt = `당신은 B01호 블로그의 ${role.name}입니다. ${roleInstruction(task.role)}\nlocal-console/prompts/conversation-context.md의 사용자 선호를 참고하세요. 사실과 편집 제안을 구분하고 최신 사용자 답변을 우선하세요.\n프로젝트: ${root}\n이 명령은 로컬 편집실에서 실행됩니다. 편집실 CLI로 자기 자신에게 작업을 재위임하지 마세요. 다른 에이전트를 생성하지 마세요. 비밀 설정 파일과 인증 정보는 읽거나 출력하지 마세요. ${task.mode === 'read-only' ? '파일은 변경하지 마세요.' : '사용자 요청에 필요한 프로젝트 파일만 변경하세요.'} 결과는 한국어로 완료한 일, 확인 근거, 남은 일을 간결하게 보고하세요.\n${protocol}\n${previous ? `이전 요청: ${previous.prompt}\n이전 결과: ${previous.result}\n이전 질문과 답변: ${JSON.stringify(previous.questions || [])}\n` : ''}사용자 명령:\n${task.prompt}`;
    const args=['exec', '--json', '--color', 'never', '-C', root, '--sandbox', task.mode, '-c', 'approval_policy="never"'];
    if(task.role==='publisher' && task.mode==='workspace-write')args.push('-c','sandbox_workspace_write.network_access=true');
    args.push('-');
    const childEnv={...process.env};
    const bundledNode=path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin');
    if(task.role==='publisher' && fs.existsSync(path.join(bundledNode,'node')))childEnv.PATH=bundledNode+path.delimiter+(process.env.PATH||'');
    const child = spawn(codex, args, { cwd: root, env:childEnv, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    active = { task, child }; let buffer = '', stderr = '', completed = false, failed = false;
    const onLine = line => {
      let e; try { e = JSON.parse(line); } catch { return; }
      task.lastEventAt = new Date().toISOString();
      if (e.type === 'thread.started') task.sessionId = e.thread_id;
      if (e.type === 'turn.completed') { completed = true; task.usage = e.usage; }
      if (e.type === 'turn.failed' || e.type === 'error') { failed = true; task.error = e.error?.message || e.message || 'Codex 실행 오류'; event(task, task.error); }
      const item = e.item;
      if (item?.type === 'agent_message' && e.type === 'item.completed') {
        for (const m of item.text.matchAll(/\[\[(PROGRESS|DONE):([a-z]+)(?:\|([^\]]+))?\]\]/g)) {
          if (!(STAGES[task.role] || []).some(s => s[0] === m[2])) continue;
          if (m[1] === 'DONE') task.doneStages = [...new Set([...(task.doneStages || []),m[2]])];
          else { task.stage = m[2]; task.activity = m[3] || STAGES[task.role].find(s=>s[0]===m[2])[1]; }
        }
        task.result = item.text; event(task, item.text);
      }
      else if (item?.type === 'command_execution') { task.activity ||= '관련 자료를 읽고 실행 결과를 확인하고 있습니다.'; event(task, `${e.type === 'item.started' ? '실행 중' : '실행 확인'}: ${item.command}`); }
      else if (item?.type === 'file_change') event(task, `파일 변경: ${(item.changes || []).map(c => c.path).join(', ')}`);
      else if (e.type === 'turn.started') event(task, 'Codex가 작업을 시작했습니다.');
      save();
    };
    child.stdout.on('data', chunk => { buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(onLine); if (buffer.length > 2_000_000) buffer = ''; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-6000); });
    child.stdin.on('error', () => {});
    child.on('error', err => { task.error = `Codex를 실행하지 못했습니다: ${err.message}`; failed = true; });
    child.on('close', async code => {
      if (buffer) onLine(buffer);
      if (task.status !== 'cancelled' && task.status !== 'interrupted') {
        task.status = code === 0 && completed && !failed ? 'completed' : 'failed';
        if (task.status === 'failed') task.error ||= stderr.trim() || `실행이 완료되지 않았습니다 (종료 코드 ${code}).`;
        if (task.status === 'completed') {
          task.report = readReport(task.result);
          task.questions = task.report?.questions || [];
          if (task.report?.outcome === 'needs_input' || task.questions.some(q => q.required)) task.status = 'waiting_input';
        }
      }
      task.finishedAt = new Date().toISOString(); save();
      try { await finishArticle(task); } catch(err) { const a = workflow.data.articles.find(a=>a.id===task.articleId); if(a) { a.status='failed'; a.error=err.message; task.status='failed';task.error=err.message;save();workflow.save(); } }
      if(task.role==='publisher'&&task.articleId){const a=article(task.articleId);if(a.status==='failed'&&a.publicationWindow){a.publicationWindow.status='failed';try{a.failureReported=await notifications.reportFailure(a);}catch{a.failureReported=false;}workflow.save();}}
      active = null; runNext();
    });
    child.stdin.end(prompt);
  }
  function addTask(input) {
    if (!roles.some(r => r.id === input.role)) throw new Error('담당 에이전트를 선택하세요.');
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 12000) throw new Error('명령은 1~12,000자로 입력하세요.');
    if (!['read-only', 'workspace-write'].includes(input.mode || 'read-only')) throw new Error('지원하지 않는 실행 방식입니다.');
    if (!connection.installed || !connection.authenticated) throw new Error('Codex 설치와 로그인을 확인하고 편집실을 재시작하세요.');
    if (tasks.filter(t => ['queued', 'running'].includes(t.status)).length >= 20) throw new Error('대기 중인 작업이 많습니다. 완료 후 다시 보내세요.');
    if (input.parentId && !tasks.some(t => t.id === input.parentId && ['completed', 'waiting_input', 'failed', 'cancelled', 'interrupted'].includes(t.status))) throw new Error('완료된 이전 작업을 선택하세요.');
    const task = { id: randomUUID(), role: input.role, prompt: input.prompt.trim(), mode: input.mode || 'read-only', parentId: input.parentId || null, source: input.source === 'codex' ? 'codex' : 'browser', status: 'queued', createdAt: new Date().toISOString(), result: '', events: [], doneStages:[], questions:[], articleId:input.articleId || null };
    tasks.push(task); save(); runNext(); return task;
  }
  function kill(child) {
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
    const timeout = setTimeout(() => { try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000);
    timeout.unref(); child.once('close', () => clearTimeout(timeout));
  }
  function cancel(id) {
    const task = tasks.find(t => t.id === id); if (!task) return false;
    if (['queued', 'running'].includes(task.status)) { task.status = 'cancelled'; task.finishedAt = new Date().toISOString(); save(); if (active?.task.id === id) kill(active.child); else if(task.articleId) {const a=article(task.articleId);a.status='failed';a.error='대기 작업이 취소되었습니다.';workflow.save();} }
    return true;
  }
  function article(id) { const a=workflow.data.articles.find(a=>a.id===id); if(!a) throw new Error('글을 찾을 수 없습니다.'); return a; }
  function editable(a) { if (a.taskIds.some(id=>tasks.some(t=>t.id===id && ['running','queued'].includes(t.status))) || a.status==='publishing') throw new Error('작업 중에는 내용을 수정할 수 없습니다. 완료를 기다리거나 작업을 중단하세요.'); if(a.status==='published') throw new Error('발행된 글은 새 수정 작업으로 관리하세요.'); }
  function invalidate(a) { a.revision++; a.approvedAt=null; a.scheduledAt=null; a.review=null; a.status=a.draftFile?'draft_ready':'planned'; a.error=null; a.publicationWindow=null; }
  function launchArticle(a, type, source='browser') {
    editable(a);
    if(type==='publish' && workflow.data.publicationPolicy?.enabled && a.publicationWindow?.status!=='publishing')throw new Error('텔레그램 확인 알림과 1시간 대기 또는 지금 발행 선택이 먼저 필요합니다.');
    if(type==='publish' && (!a.approvedAt || a.review?.draftHash!==draftHash(a) || hasPlaceholders(a))) throw new Error('승인 후 원고가 변경되었거나 확인 필요 문구가 남아 있습니다. 다시 검수하고 승인하세요.');
    if(type==='review' && !a.draftFile) throw new Error('먼저 초안을 작성하세요.');
    if(type==='review' && a.draftRevision!==undefined && a.draftRevision!==a.revision)throw new Error('저장된 답변과 설정을 반영하도록 초안을 먼저 보완하세요.');
    const previewFile=a.draftFile?preparePreview(a):null;
    const context = `글 ID: ${a.id}\n원고·자료 버전: ${a.revision}\n검수 버전: ${a.review?.revision ?? '미검수'}\n현재 상태: ${a.status}\n채널: B01 정적 HTML 블로그\n이번 담당 작업: ${type}\n본문 표시 규칙: ${JSON.stringify(normalizeFormat(a.format))}. lineBreaks paragraph는 문단 중심, source는 원문 줄바꿈 유지. spacing은 문단 간격, emphasis는 굵게·배경 강조·강조 없음입니다. 최종 HTML 본문에는 ${previewFile||'초안 작성 후 생성되는 미리보기'}의 article과 style을 그대로 사용하세요. 내부 메타데이터·편집 메모·코드 블록은 공개 본문에 넣지 마세요.\n글 제목: ${a.title}\n분류: ${a.category}\n방향: ${a.angle}\n예정 일자: ${a.date}\n담당자: ${a.owner || '미지정'}\n최근 수정 의견: ${a.rewriteNote||'없음'}\n확인 질문과 답변: ${JSON.stringify(a.questions)}\n사진 안내: ${a.photoBrief}\n사진 선택: ${a.photoDecision}\n첨부 사진 경로: ${a.images.map(i=>path.join(dataDir,'uploads',i.id)).join(', ') || '없음'}\n현재 초안: ${a.draftFile || '없음'}`;
    let prompt, r;
    if(type==='draft') { r='writer'; prompt=`${context}\n대화 참고 자료(현재 글의 답변이 우선이며 다른 글의 경험을 이번 경험으로 옮기지 말 것): ${JSON.stringify(conversationBrief(workflow.data.articles,a)).slice(0,3500)}\n사용자의 최근 원고 수정 요청: ${a.rewriteNote||'없음'}\nlocal-console/prompts/conversation-context.md를 읽고 확정된 선호를 적용하세요. 초안을 먼저 완성한 뒤 이번 원고에 맞는 질문을 자연스러운 존댓말로 3~5개 이내 생성하세요. 각 질문은 어느 문단을 어떤 방향으로 썼는지 help에 설명하고 ‘이 부분은 이렇게 풀어봤는데, 생각과 맞나요?’처럼 한 번에 한 가지를 물으세요. 취향·방향 질문은 required:false이며 미답변이어도 초안 작성이 끝나야 합니다. 발행에 꼭 필요한 미확인 사실만 required:true로 남기세요. 이미 답한 내용은 다시 묻지 마세요. questions는 미답변 기존 질문 중 여전히 필요한 사실 확인을 포함한 최신 전체 질문 목록입니다. 추정한 답을 사용자 답변으로 기록하지 마세요. 선택 질문만 있으면 outcome:ready로 보고하세요.\n이 계획의 ${a.draftFile?'초안을 답변과 검수에 맞게 보완':'초안을 미리 작성'}하세요. 최근 5개 글과 같은 결론을 반복하지 마세요. 미확인 경험은 [확인 필요]로 표시한 검토용 초안을 만들고 파일은 반드시 저장하세요. 답변이 없어도 초안 구조와 비경험 문단을 먼저 준비하세요. 사실을 지어내지 마세요. SEO 13개 항목을 고려하세요. 저장 경로는 story/drafts/${a.id}.md입니다. 기존 검수: ${JSON.stringify(a.review)}. 자동 보완 중에는 검수에서 실패한 항목을 직접 수정하고, 근거 없는 비핵심 주장은 삭제하거나 제한하세요. 사용자만 아는 핵심 경험은 만들어내지 말고 필수 질문으로 남기세요. 선택 질문은 진행을 막지 않습니다. 질문이 남으면 needs_input으로 보고하세요. 공개 파일과 posts.json은 수정하지 마세요.`; }
    else if(type==='review') { r='seo'; prompt=`${context}\n저장된 초안을 읽고 발행 전 검수하세요. ${JSON.stringify(a.questions)}의 미답변 필수 질문과 [확인 필요] 문구가 있으면 통과시키지 마세요. 초안 단계에서 HTML에만 해당하는 항목은 na로 명시하고 발행 단계에서 재검증하도록 안내하세요. 스킬 13개 항목의 근거를 checks에 모두 포함하세요. 수정이 필요하면 changes_requested를 반환하세요.`; }
    else { r='publisher'; prompt=`${context}\n사용자가 설정한 발행 권한 조건을 실행기가 확인했습니다. 발행 근거는 ${a.publicationWindow?.reason||'사용자 승인 예약 시각 도달'} 입니다. 승인된 초안을 기준으로 글과 메타데이터를 준비하고 기존 Vercel 프로젝트에 공개 발행하세요. 프로젝트 루트에서 npx --cache .editorial-console/npm-cache --yes vercel whoami로 기존 로그인을 확인하고, 준비가 끝나면 npx --cache .editorial-console/npm-cache --yes vercel --prod --yes로 기존 연결에 배포할 수 있습니다. 로그인이 필요하거나 권한이 부족하면 실패로 보고하세요. 다른 미승인 초안이나 예약 글을 공개하지 마세요. .vercelignore에서 story/drafts/, local-console/, .editorial-console/ 제외를 확인하세요. 기존 작업을 훼손하거나 다른 변경을 커밋하지 마세요. posts.json, 정적 HTML, sitemap, feed, llms.txt를 일관되게 갱신하고 스킬 검수를 수행하세요. 실패하면 사실대로 보고하세요. 실제 공개 주소에서 제목과 본문을 확인한 후 publishedUrl을 반환하세요.`; }
    const t=addTask({role:r,prompt,mode:type==='review'?'read-only':'workspace-write',articleId:a.id,source});
    if(type==='review') {t.draftHash=draftHash(a);save();}
    for(const old of tasks)if(a.taskIds.includes(old.id) && old.status==='waiting_input'){old.status='completed';old.followupId=t.id;}
    save();
    a.taskIds.push(t.id); a.status=type==='draft'?'drafting':type==='review'?'reviewing':'publishing'; a.error=null;
    if(type!=='publish') { a.publicationWindow=null; a.review=null; a.approvedAt=null; a.scheduledAt=null; }
    workflow.save(); return t;
  }
  async function finishArticle(task) {
    if(!task.articleId) return;
    const a=article(task.articleId), report=task.report;
    if(!['completed','waiting_input'].includes(task.status)) { a.status='failed'; a.error=task.error || '작업이 중단되었습니다.'; workflow.save(); return; }
    if(!report) { a.status='failed'; a.error='작업 응답을 받았지만 단계 결과 형식이 없습니다. 기록을 확인하고 다시 요청하세요.'; workflow.save(); return; }
    if(task.role==='writer') {
      if(report.draftFile !== `story/drafts/${a.id}.md` || !fs.existsSync(path.join(root,report.draftFile))) throw new Error('초안 저장을 확인하지 못했습니다. 작업 기록을 확인하세요.');
      a.draftFile=report.draftFile; a.draftRevision=a.revision;
      a.questions=refreshDraftQuestions(a.questions,report.questions);
      a.status=report.outcome==='needs_input' || a.questions.some(q=>q.required&&!q.answer.trim())?'needs_input':'draft_ready';
    } else if(task.role==='seo') {
      a.review={...report,taskId:task.id,at:task.finishedAt,revision:a.revision,draftHash:task.draftHash};
      for(const q of report.questions) if(!a.questions.some(old=>old.label===q.label)) a.questions.push(q);
      const passed=!hasPlaceholders(a) && task.draftHash===draftHash(a) && report.outcome==='ready' && new Set(report.checks.map(c=>c.label)).size>=13 && report.checks.some(c=>c.status==='pass') && report.checks.every(c=>c.status!=='fail'&&c.evidence.trim()) && !a.questions.some(q=>q.required&&!q.answer.trim());
      a.status=passed?'reviewed':report.outcome==='needs_input'?'needs_input':'changes_requested';
    } else {
      if(report.outcome!=='ready' || !report.publishedUrl) throw new Error('발행 성공을 확인하지 못했습니다. 공개 주소와 결과를 확인하세요.');
      const posts=library().posts, post=posts.find(p=>p.title===a.title);
      if(!post?.url || !post.localPage) throw new Error('발행 목록에 원고와 일치하는 글이 없습니다.');
      const html=fs.readFileSync(path.join(root,'story',post.url),'utf8');
      if(/\[확인\s*필요|\[미확인|\bTODO\b|나만 보는 확인 요청/.test(html)) throw new Error('발행 HTML에 비공개 확인 요청이 남아 있습니다.');
      const canonical=html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1];
      const published=new URL(report.publishedUrl);
      if(published.protocol!=='https:' || published.username || published.password || canonical!==report.publishedUrl || published.origin!==publishOrigin || !published.hostname.endsWith('.vercel.app')) throw new Error('기존 Vercel 공개 주소와 일치하지 않습니다. 직접 확인이 필요합니다.');
      const remote=await verifyFetch(published,{signal:AbortSignal.timeout(20000),redirect:'error'});
      const body=await remote.text();
      if(!remote.ok || !body.includes(a.title.replace(/&/g,'&amp;')) && !body.includes(a.title)) throw new Error('공개 페이지에서 글 제목을 확인하지 못했습니다.');
      const expected=readDraft(fs.readFileSync(path.join(root,a.draftFile),'utf8'),publishOrigin);
      if(/\[확인\s*필요|\[미확인|\bTODO\b|나만 보는 확인 요청/.test(body)) throw new Error('공개 페이지에서 비공개 확인 요청을 발견했습니다. 발행 상태를 확인하세요.');
      const text=body.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'\"').replace(/&#39;/g,"'").replace(/\s+/g,' ');
      const excerpts=expected.plain.split(/\n\s*\n/).filter(p=>p.length>80&&!p.includes('[확인 필요]')).slice(0,3).map(p=>p.replace(/\s+/g,' ').slice(0,60));
      if(!excerpts.length||excerpts.some(p=>!text.includes(p)))throw new Error('공개 페이지 본문이 승인된 원고와 일치하는지 확인하지 못했습니다.');
      if(!body.includes(`data-editorial-format="${formatSignature(a)}"`))throw new Error('공개 페이지의 본문 표시 규칙 적용을 확인하지 못했습니다.');
      if(a.publicationWindow)a.publicationWindow.status='published';
      a.status='published'; a.publishedUrl=report.publishedUrl; a.publishedAt=new Date().toISOString();
      workflow.save();
      await notifications.deliver(a,notificationText(a,expected.summary),()=>workflow.save());
    }
    workflow.save();
  }
  function formatSignature(a){const f=normalizeFormat(a.format);return `${f.lineBreaks}-${f.spacing}-${f.emphasis}`;}
  function previewHtml(a){
    if(!a.draftFile)throw new Error('먼저 초안을 작성하세요.');
    const reading=readDraft(fs.readFileSync(path.join(root,a.draftFile),'utf8'),publishOrigin);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(a.title)} · 검토용</title><style>${readingCss}</style></head><body><article class="${readingClass(a.format)}" data-editorial-format="${formatSignature(a)}">${reading.html}</article></body></html>`;
  }
  function preparePreview(a){const dir=path.join(dataDir,'previews');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,a.id+'.html');fs.writeFileSync(file,previewHtml(a),{mode:0o600});return file;}
  function updateAnswers(questions, answers) {
    if(!answers || typeof answers!=='object' || Array.isArray(answers)) throw new Error('답변 형식이 올바르지 않습니다.');
    for(const [id,value] of Object.entries(answers)) if(!questions.some(q=>q.id===id) || typeof value!=='string' || value.length>6000) throw new Error('질문 또는 답변을 확인하세요.');
    for(const q of questions) if(Object.hasOwn(answers,q.id)) q.answer=answers[q.id].trim();
  }
  function readyForPublication(a){return !!a.draftFile && !!a.review && a.review.revision===a.revision && a.review.draftHash===draftHash(a) && a.review.outcome==='ready' && a.review.checks.length>=13 && a.review.checks.every(c=>c.status!=='fail'&&c.evidence.trim()) && !hasPlaceholders(a) && !a.questions.some(q=>q.required&&!q.answer.trim()) && a.photoDecision!=='pending';}
  async function requestPublication(a){
    if(!readyForPublication(a))throw new Error('최신 원고 검수와 필수 자료 확인이 먼저 필요합니다.');
    if(a.publicationWindow && !['blocked'].includes(a.publicationWindow.status))return;
    if((workflow.data.editorialPolicy?.enabled||workflow.data.publicationPolicy?.requireTelegramApproval)&&!notifications.status().remoteApproval){a.publicationWindow={status:'blocked',error:'텔레그램 원격 발행·보류 연결이 필요합니다. 자동 발행 대기는 시작하지 않았습니다.'};workflow.save();return;}
    if(!notifications.status().enabled||!notifications.status().verifiedAt){a.publicationWindow={status:'blocked',error:'텔레그램 연결 후 알림이 전달되어야 1시간 대기를 시작합니다.'};workflow.save();return;}
    const window=createPublicationWindow(draftHash(a));a.publicationWindow=window;workflow.save();
    try{const id=await notifications.requestPublication(a,readDraft(fs.readFileSync(path.join(root,a.draftFile),'utf8'),publishOrigin).summary,{requireApproval:!!workflow.data.publicationPolicy?.requireTelegramApproval});if(a.publicationWindow!==window)return;a.publicationWindow=acceptPublicationNotice(window,id);if(workflow.data.publicationPolicy?.requireTelegramApproval)a.publicationWindow.deadline=null;}
    catch(e){if(a.publicationWindow!==window)return;a.publicationWindow={...window,status:e.uncertain?'unknown':'failed',error:e.message};}
    workflow.save();
  }
  function publishConfirmed(a,manual=false,source='browser'){
    if(workflow.data.publicationPolicy?.requireTelegramApproval&&source!=='telegram')throw new Error('텔레그램의 발행 승인 버튼으로 승인해주세요. 응답이 없으면 발행하지 않습니다.');
    if(!readyForPublication(a) || a.publicationWindow?.draftHash!==draftHash(a) || a.publicationWindow?.status!=='waiting')throw new Error('최신 원고의 텔레그램 알림 전달 확인이 필요합니다.');
    a.publicationWindow.status='publishing';a.publicationWindow.reason=manual?'user':'one-hour-timeout';a.approvedAt ||= new Date().toISOString();workflow.save();
    try{return launchArticle(a,'publish');}catch(e){a.publicationWindow.status='failed';a.status='failed';a.error=e.message;workflow.save();throw e;}
  }
  function workflowAction(route,input) {
    if(route==='/api/workflow/editorial-policy'){
      if(typeof input.enabled!=='boolean')throw new Error('자동 검수 설정을 확인하세요.');
      workflow.data.editorialPolicy={enabled:input.enabled,maxRevisions:2};workflow.save();return workflow.data.editorialPolicy;
    }
    if(route==='/api/workflow/publication-policy'){if(typeof input.enabled!=='boolean')throw new Error('자동 발행 설정을 확인하세요.');if(input.requireTelegramApproval!==undefined&&typeof input.requireTelegramApproval!=='boolean')throw new Error('승인 방식을 확인하세요.');workflow.data.publicationPolicy={enabled:input.enabled,requireTelegramApproval:input.requireTelegramApproval??workflow.data.publicationPolicy?.requireTelegramApproval??false,delayMinutes:60,updatedAt:new Date().toISOString()};if(workflow.data.publicationPolicy.requireTelegramApproval)for(const a of workflow.data.articles)if(a.publicationWindow?.status==='waiting')a.publicationWindow.deadline=null;if(!input.enabled)for(const a of workflow.data.articles)if(a.publicationWindow?.status==='waiting')a.publicationWindow.status='held';workflow.save();return workflow.data.publicationPolicy;}

    if(route==='/api/workflow/weeks') { const articles=createWeek(input.startDate,workflow.data.articles); workflow.data.articles.push(...articles); workflow.save(); return {articles}; }
    if(route==='/api/workflow/batch') {
      const articles=workflow.data.articles.filter(a=>a.week===input.week && a.status==='planned').slice(0,5);
      if(!articles.length) throw new Error('새 초안을 준비할 글이 없습니다.');
      if(tasks.filter(t=>['running','queued'].includes(t.status)).length+articles.length>20) throw new Error('작업 대기열이 가득 찼습니다.');
      return {tasks:articles.map(a=>launchArticle(a,'draft',input.source))};
    }
    const m=route.match(/^\/api\/workflow\/articles\/([a-f0-9-]+)\/(save|answers|rewrite|draft|review|approve|schedule|unschedule|photos|remove-photo|format|publish-now|hold|ask-publication)$/);
    if(!m) return null;
    const a=article(m[1]); editable(a);
    if(m[2]==='rewrite') {
      if(typeof input.note!=='string' || input.note.length>6000) throw new Error('수정 의견은 6,000자 이내로 입력하세요.');
      const updated=a.questions.map(q=>({...q}));
      updateAnswers(updated,input.answers || {});
      a.questions=updated; a.rewriteNote=input.note.trim(); invalidate(a); workflow.save();
      return launchArticle(a,'draft',input.source);
    }
    if(m[2]==='draft' || m[2]==='review') return launchArticle(a,m[2],input.source);
    if(m[2]==='hold'){a.publicationWindow={...a.publicationWindow,status:'held',heldAt:new Date().toISOString()};a.scheduledAt=null;if(a.status==='scheduled')a.status='approved';}
    if(m[2]==='publish-now')return publishConfirmed(a,true);
    if(m[2]==='ask-publication'){if(!readyForPublication(a))throw new Error('최신 원고 검수와 필수 자료 확인이 먼저 필요합니다.');if(a.publicationWindow?.status==='requesting'||a.publicationWindow?.status==='waiting')throw new Error('이미 발행 확인을 진행 중입니다.');if(a.publicationWindow?.status==='unknown'&&input.confirmDuplicateChecked!==true)throw new Error('텔레그램에서 중복 알림 여부를 확인한 뒤 다시 요청하세요.');a.publicationWindow=null;a.status='reviewed';}
    if(m[2]==='format') {const format=normalizeFormat(input.format);if(JSON.stringify(format)!==JSON.stringify(normalizeFormat(a.format))){a.format=format;invalidate(a);}}
    if(m[2]==='save') {
      for(const key of ['title','angle','owner','date','publishTime','photoDecision']) if(input[key]!==undefined && typeof input[key]!=='string') throw new Error('입력 형식을 확인하세요.');
      if(input.title!==undefined && (!input.title.trim() || input.title.length>100)) throw new Error('제목은 1~100자로 입력하세요.');
      if(input.owner?.length>100 || input.angle?.length>1500) throw new Error('입력 내용이 너무 깁니다.');
      if(input.date!==undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date+'T00:00:00Z')) || new Date(input.date+'T00:00:00Z').toISOString().slice(0,10)!==input.date)) throw new Error('날짜를 확인하세요.');
      if(input.publishTime!==undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.publishTime)) throw new Error('시간을 확인하세요.');
      if(input.photoDecision!==undefined && !['pending','none','attached'].includes(input.photoDecision)) throw new Error('사진 사용 여부를 선택하세요.');
      if(input.photoDecision==='attached' && !a.images.length) throw new Error('먼저 사진을 첨부하세요.');
      const changed=['title','angle','photoDecision'].some(k=>input[k]!==undefined&&input[k]!==a[k]);
      const scheduleChanged=['date','publishTime'].some(k=>input[k]!==undefined&&input[k]!==a[k]);
      for(const key of ['title','angle','owner','date','publishTime','photoDecision']) if(input[key]!==undefined) a[key]=input[key].trim();
      if(changed) invalidate(a); else if(scheduleChanged && a.status==='scheduled') { a.status='approved'; a.scheduledAt=null; }
    }
    if(m[2]==='answers') { const before=JSON.stringify(a.questions); updateAnswers(a.questions,input.answers); if(JSON.stringify(a.questions)!==before) invalidate(a); }
    if(m[2]==='photos') {
      if(a.images.length>=6) throw new Error('사진은 글당 최대 6장입니다.');
      if(typeof input.data!=='string' || input.data.length>8_400_000) throw new Error('사진은 6MB 이하로 첨부하세요.');
      const bytes=Buffer.from(input.data,'base64');
      const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(!png&&!jpeg&&!webp || bytes.length>6_291_456) throw new Error('PNG, JPEG, WebP 사진만 6MB 이하로 첨부할 수 있습니다.');
      const id=randomUUID()+ (png?'.png':jpeg?'.jpg':'.webp'); const dir=path.join(dataDir,'uploads'); fs.mkdirSync(dir,{recursive:true,mode:0o700}); fs.writeFileSync(path.join(dir,id),bytes,{mode:0o600});
      a.images.push({id,name:String(input.name||'사진').slice(0,180),at:new Date().toISOString()}); invalidate(a); a.photoDecision='attached';
    }
    if(m[2]==='remove-photo') {if(!a.images.some(i=>i.id===input.id))throw new Error('첨부 사진이 없습니다.');a.images=a.images.filter(i=>i.id!==input.id);invalidate(a);if(!a.images.length)a.photoDecision='pending';}
    if(m[2]==='approve') {
      if(a.status!=='reviewed' || hasPlaceholders(a) || a.review?.revision!==a.revision || a.review?.draftHash!==draftHash(a) || a.questions.some(q=>q.required&&!q.answer.trim()) || a.photoDecision==='pending') throw new Error('질문 답변, 사진 선택, 확인 필요 문구 보완, 최신 원고 검수가 먼저 필요합니다.');
      a.status='approved'; a.approvedAt=new Date().toISOString();
    }
    if(m[2]==='schedule') {
      if(workflow.data.publicationPolicy?.enabled)throw new Error('현재는 텔레그램 알림 후 1시간 자동 발행 방식입니다. 글별 발행 확인을 이용하세요.');
      if(!['approved','missed'].includes(a.status) || !a.approvedAt || a.review?.revision!==a.revision || a.review?.draftHash!==draftHash(a)) throw new Error('최신 원고의 최종 발행 승인이 필요합니다.');
      const date=new Date(`${a.date}T${a.publishTime}:00+09:00`); if(date.getTime()<=Date.now()) throw new Error('미래의 예약 시각을 선택하세요.');
      a.scheduledAt=date.toISOString(); a.status='scheduled';
    }
    if(m[2]==='unschedule') { if(a.status==='scheduled'||a.status==='missed') {a.status='approved';a.scheduledAt=null;} }
    workflow.save(); return a;
  }
  let decisionPoll=false;
  function tick(now=Date.now(),decisionsChecked=false) {
    if(!closing&&notifications.status().remoteApproval&&notifications.status().enabled&&workflow.data.articles.some(a=>a.publicationWindow?.status==='waiting')&&!decisionsChecked){
      if(decisionPoll)return;
      decisionPoll=true;
      notifications.pollDecisions(q=>{
        const match=q.data?.match(/^b01:(publish|hold):([a-f0-9-]+)$/);
        if(!match)return '알 수 없는 요청입니다.';
        const a=article(match[2]);
        if(a.publicationWindow?.status!=='waiting'||a.publicationWindow.messageId!==q.message.message_id)return '이미 처리됐거나 이전 원고의 요청입니다.';
        if(match[1]==='publish'){publishConfirmed(a,true,'telegram');return '발행을 시작합니다. 결과를 알려드릴게요.';}
        a.publicationWindow.status='held';a.scheduledAt=null;workflow.save();return '보류했습니다. 자동 발행하지 않습니다.';
      }).then(ok=>{if(ok)tick(now,true);}).finally(()=>{decisionPoll=false;});
      return;
    }
    if(closing) return;
    if(workflow.data.editorialPolicy?.enabled){
      for(const a of workflow.data.articles){
        if(a.taskIds.some(id=>tasks.some(t=>t.id===id&&['running','queued'].includes(t.status))))continue;
        if(a.autoRevision!==a.revision){a.autoRevision=a.revision;a.autoAttempts=0;a.autoBlocked=null;}
        if(a.autoBlocked)continue;
        try{
          if(['draft_ready','needs_input','changes_requested'].includes(a.status)&&a.photoDecision==='pending'&&!a.images.length){a.photoDecision='none';invalidate(a);workflow.save();}
          if(a.status==='draft_ready'&&!hasPlaceholders(a)&&!a.questions.some(q=>q.required&&!q.answer.trim())&&a.draftRevision===a.revision){launchArticle(a,'review');}
          else if(['draft_ready','needs_input','changes_requested'].includes(a.status)){
            if((a.autoAttempts||0)>=2){a.autoBlocked='자동 보완 2회 후에도 확인할 내용이 남았습니다. 질문에 답하면 자동 보완을 다시 진행합니다.';workflow.save();continue;}
            a.autoAttempts=(a.autoAttempts||0)+1;workflow.save();launchArticle(a,'draft');
          }
        }catch(e){a.autoBlocked=e.message;workflow.save();}
      }
    }
    if(workflow.data.publicationPolicy?.enabled){
      for(const a of workflow.data.articles){
        if(a.taskIds.some(id=>tasks.some(t=>t.id===id&&['running','queued'].includes(t.status))))continue;
        if(a.publicationWindow?.status==='waiting'){
          if(!readyForPublication(a)){a.publicationWindow.status='invalidated';a.approvedAt=null;a.status='changes_requested';workflow.save();continue;}
          if(!workflow.data.publicationPolicy?.requireTelegramApproval&&publicationDue(a.publicationWindow,draftHash(a),now)){try{publishConfirmed(a);}catch{};}
        }else if(['reviewed','approved','scheduled'].includes(a.status)&&(!a.publicationWindow||a.publicationWindow.status==='blocked')){requestPublication(a).catch(()=>{});}
      }
      return;
    }
    for(const a of workflow.data.articles) if(a.status==='scheduled' && Date.parse(a.scheduledAt)<=now) {
      if(now-Date.parse(a.scheduledAt)>6*60*60*1000) { a.status='missed'; workflow.save(); continue; }
      try { launchArticle(a,'publish'); } catch(err) { a.status='failed';a.error=err.message;workflow.save(); }
    }
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const address = server.address(); const origin = `http://127.0.0.1:${address?.port}`;
    if (req.headers.host !== `127.0.0.1:${address?.port}`) return send(403, { error: '허용되지 않은 호스트입니다.' });
    if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: '외부 사이트 요청은 허용하지 않습니다.' });
    const url = new URL(req.url, origin);
    try {
      const previewRoute=url.pathname.match(/^\/preview\/([a-f0-9-]+)$/);
      if(req.method==='GET'&&previewRoute){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});return res.end(previewHtml(article(previewRoute[1])));}
      if(req.method==='GET'&&url.pathname==='/reading.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(readingCss);}
      const roleRoute=url.pathname.match(/^\/api\/roles\/(editor|writer|seo|publisher)\/prompt$/);
      if(req.method==='GET'&&roleRoute){const r=roles.find(r=>r.id===roleRoute[1]);return send(200,{role:r.id,file:r.promptFile,text:roleInstruction(r.id)});}
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, snapshot());
      if (req.method === 'GET' && url.pathname === '/api/session') return send(200, { token });
      if (req.method === 'GET' && /^\/api\/assets\/[a-f0-9-]+\.(png|jpg|webp)$/.test(url.pathname)) {
        const file=path.join(dataDir,'uploads',path.basename(url.pathname)); if(!fs.existsSync(file)) return send(404,{error:'사진이 없습니다.'});
        res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':'image/webp'}); return res.end(fs.readFileSync(file));
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (req.headers['x-editorial-token'] !== token) return send(403, { error: '연결을 새로 고친 뒤 다시 시도하세요.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON 요청이 필요합니다.' });
        const limit=url.pathname.endsWith('/photos')?9_000_000:100_000;
        let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > limit) return send(413, { error: '요청이 너무 큽니다.' }); }
        const input = JSON.parse(raw || '{}');
        if(url.pathname==='/api/notifications/settings')return send(200,notifications.configure(input));
        if(url.pathname==='/api/notifications/check')return send(200,await notifications.check());
        const notifyRoute=url.pathname.match(/^\/api\/notifications\/([a-f0-9-]+)\/send$/);
        if(notifyRoute){const a=article(notifyRoute[1]);const summary=readDraft(fs.readFileSync(path.join(root,a.draftFile),'utf8'),publishOrigin).summary;return send(200,await notifications.deliver(a,notificationText(a,summary),()=>workflow.save(),{retryUnknown:input.retryUnknown===true}));}
        if (url.pathname === '/api/tasks') return send(201, addTask(input));
        if(url.pathname.startsWith('/api/workflow/')) {const result=workflowAction(url.pathname,input);if(result) return send(200,result);}
        const answerRoute=url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)\/(answers|continue)$/);
        if(answerRoute) {
          const task=tasks.find(t=>t.id===answerRoute[1]); if(!task || task.status!=='waiting_input') throw new Error('답변 대기 중인 작업을 선택하세요.');
          if(task.articleId) throw new Error('이 작업의 주간 계획 카드에서 답변하고 원고를 보완하세요.');
          if(answerRoute[2]==='answers') {updateAnswers(task.questions,input.answers);save();return send(200,task);}
          if(task.questions.some(q=>q.required&&!q.answer.trim())) throw new Error('필수 질문에 먼저 답하세요.');
          const follow=addTask({role:task.role,prompt:'위 질문에 저장된 답변을 반영하여 원래 요청을 이어서 진행하세요.',mode:task.mode,parentId:task.id,source:input.source});
          task.status='completed';task.followupId=follow.id;save();return send(201,follow);
        }
        const match = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)\/cancel$/);
        if (match) return send(cancel(match[1]) ? 200 : 404, { ok: true });
      }
      const files = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'], '/style.css': ['public/style.css', 'text/css'], '/workflow.js':['public/workflow.js','text/javascript'], '/workflow.css':['public/workflow.css','text/css'] };
      if (req.method === 'GET' && files[url.pathname]) { const [file, type] = files[url.pathname]; res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(fs.readFileSync(path.join(here, file))); }
      send(404, { error: '페이지를 찾을 수 없습니다.' });
    } catch (err) { send(400, { error: err.message }); }
  });
  server.on('close', () => { closing = true; clearInterval(scheduler); if (active) { active.task.status = 'interrupted'; save(); kill(active.child); } });
  return { server, snapshot, tick, start: () => new Promise(resolve => server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    fs.writeFileSync(path.join(dataDir, 'connection.json'), JSON.stringify({ url, token }), { mode: 0o600 }); scheduler=setInterval(tick,15000);scheduler.unref();tick();resolve(url);
  })), stop: () => { closing = true;clearInterval(scheduler); if (active) { active.task.status = 'interrupted'; save(); kill(active.child); } server.close(); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createConsole(); app.server.on('error', err => { console.error(err.message); process.exitCode = 1; });
  console.log(`B01 편집실: ${await app.start()}`);
  process.on('SIGTERM', () => app.stop()); process.on('SIGINT', () => app.stop());
}
