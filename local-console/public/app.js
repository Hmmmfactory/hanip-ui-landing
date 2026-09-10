const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state, token, view = 'overview', tab = 'posts', selectedTask = null, pendingParent = null, loading = false, connected = false;
const labels = { queued: '대기 중', running: '작업 중', completed: '완료', waiting_input: '답변 필요', failed: '실패', cancelled: '중단됨', interrupted: '연결 중단' };
const role = id => state.roles.find(r => r.id === id);
const time = value => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const avatar = r => `<span class="avatar ${esc(r.color)}">${esc(r.initial)}</span>`;
const working = t => ['running', 'queued'].includes(t.status);

async function request(route, body) {
  const res = await fetch(route, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Editorial-Token': token } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.'); return data;
}
async function refresh() {
  if (loading) { await new Promise(resolve=>setTimeout(resolve,80)); return refresh(); } loading = true;
  try {
    ({ token } = await request('/api/session'));
    state = await request('/api/state');
    connected = true;
    $('#connection').textContent = state.connection.authenticated ? 'Codex 연결됨' : 'Codex 로그인 필요';
    $('#connection').classList.toggle('off', !state.connection.authenticated);
    $('#sync').textContent = '방금 동기화';
    $('#notice').hidden = !state.errors.length; $('#notice').textContent = state.errors.join(' ');
    render();
    if(location.hash==='#telegram'&&typeof showNotifications==='function'){history.replaceState(null,'',location.pathname);showNotifications();}
    if (selectedTask && $('#drawer').open) renderTask(selectedTask);
    const liveArticle=$('#detail [data-live-article]')?.dataset.liveArticle;
    if(liveArticle && $('#drawer').open) {
      const top=$('#drawer').scrollTop,open=[...$('#detail').querySelectorAll('details')].map(d=>d.open);
      showArticle(liveArticle);[...$('#detail').querySelectorAll('details')].forEach((d,i)=>d.open=!!open[i]);$('#drawer').scrollTop=top;
    }
  } catch (e) { connected=false; if(state)render(); $('#notice').hidden = false; $('#notice').textContent = `연결이 끊겼습니다. ${e.message} · 로컬 편집실이 실행 중인지 확인하세요.`; $('#sync').textContent = '연결 끊김'; $('#connection').textContent = '연결 끊김'; $('#connection').classList.add('off'); }
  finally { loading = false; }
}
function postRow(p, index, draft = false) {
  return `<button class="post-row" data-post="${index}" data-draft="${draft}"><span class="document-icon">≡</span><span class="post-text"><strong>${esc(p.title)}</strong><small>${esc(p.date)} &nbsp; · &nbsp; ${draft ? '초안' : esc((p.tags || []).slice(0, 2).join(' · ') || 'B01호 이야기')}</small></span><span class="tag ${draft ? 'draft' : ''}">${draft ? '초안' : p.localPage ? '페이지 준비됨' : '본문 확인 필요'}</span><span class="arrow">›</span></button>`;
}
function taskRow(t) { const r = role(t.role); return `<button class="task-card" data-task="${esc(t.id)}">${avatar(r)}<span class="task-text"><strong>${esc(t.prompt.slice(0, 90))}</strong><small>${esc(r.name)} · ${t.source === 'codex' ? 'Codex' : '브라우저'} · ${time(t.createdAt)}</small></span><span class="status ${t.status}">${labels[t.status]}</span></button>`; }
function render() {
  $('#post-count').textContent = state.posts.length; $('#task-count').textContent = state.tasks.length;
  $('#agents').innerHTML = state.roles.map(r => `<button class="agent" data-agent="${r.id}">${avatar(r)}<span><strong>${r.name}</strong><small>${r.description}</small></span><span class="agent-state ${state.tasks.some(t => t.role === r.id && t.status === 'running') ? 'busy' : ''}"></span></button>`).join('');
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const names = { overview: ['전체 현황', '블로그의 오늘을 한눈에.', '글감부터 발행 준비까지, 에이전트와 함께 관리하세요.'], posts: ['글과 요약', '쌓여가는 이야기들.', '등록된 글의 요약과 초안, 다음 글감을 확인하세요.'], plans: ['주간 발행 계획', '한 주의 이야기를 미리 준비하세요.', '평일 가구 5편 · 토요일 취미 · 일요일 소비와 예산'], inbox: ['내가 할 일', '지금 필요한 답변과 결정.', '질문, 사진, 검수와 예약을 한 단계씩 처리하세요.'], tasks: ['작업 기록', '에이전트가 이어가는 작업.', '브라우저와 Codex에서 요청한 명령이 한곳에 모입니다.'] };
  $('#breadcrumb').textContent = names[view][0]; $('#heading').textContent = names[view][1]; $('#subheading').textContent = names[view][2];
  if ($('#inbox-count')) $('#inbox-count').textContent = (state.articles || []).filter(a => !['published','scheduled','drafting','reviewing','publishing'].includes(a.status)).length + state.tasks.filter(t=>t.status==='waiting_input'&&!t.articleId).length;
  if (view === 'overview') renderOperations();
  else if (view === 'plans') renderWeekly();
  else if (view === 'inbox') renderInbox();
  else if (view === 'posts') {
    $('#content').innerHTML = `<div class="toolbar"><button class="chip ${tab === 'posts' ? 'active' : ''}" data-tab="posts">등록 글 ${state.posts.length}</button><button class="chip ${tab === 'drafts' ? 'active' : ''}" data-tab="drafts">초안 ${state.drafts.length}</button><button class="chip ${tab === 'ideas' ? 'active' : ''}" data-tab="ideas">글감 ${state.ideas.filter(i => !i.done).length}</button></div><section class="panel">${tab === 'ideas' ? `<div class="ideas">${ideaRows(state.ideas.filter(i => !i.done))}</div>` : (tab === 'posts' ? state.posts : state.drafts).map((p, i) => postRow(p, i, tab === 'drafts')).join('') || '<div class="empty">아직 초안이 없습니다. 작가에게 글쓰기를 요청해 보세요.</div>'}</section>`;
  } else $('#content').innerHTML = `<section class="panel"><div class="panel-head"><h2>모든 작업 <span class="text-button">${state.tasks.length}</span></h2><span class="text-button">한 번에 하나씩 순서대로 실행</span></div>${[...state.tasks].reverse().map(taskRow).join('') || '<div class="empty">아직 요청한 작업이 없습니다. 사이드바의 에이전트를 선택해 첫 명령을 보내세요.</div>'}</section>`;
}
function ideaRows(ideas) { return ideas.map(i => `<button class="idea" data-idea="${esc(i.id)}"><span>◇</span><b>${esc(i.title)}</b><em>↗</em></button>`).join('') || '<div class="empty">남은 글감이 없습니다.</div>'; }
function renderOverview() {
  const count = state.posts.length, ideas = state.ideas.filter(i => !i.done), running = state.tasks.filter(working), review = state.tasks.filter(t => t.role === 'seo' && working(t)).length;
  const latest = [...state.posts].sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
  const stat = (label, icon, number, note) => `<div class="stat"><div class="stat-top">${label}<span class="stat-icon">${icon}</span></div><strong>${number}<span></span></strong><small>${note}</small></div>`;
  const recent = [...state.tasks].reverse().slice(0, 3);
  $('#content').innerHTML = `<div class="stats">${stat('등록된 글', '▤', count, latest ? `최근 등록 <em>${esc(latest.date)}</em>` : '등록 글 없음')}${stat('작성된 초안', '✎', state.drafts.length, '작가가 준비한 이야기')}${stat('진행 중인 작업', '↗', running.length, running.length ? '<em>에이전트가 작업하고 있어요</em>' : '새로운 요청을 기다리고 있어요')}${stat('남아 있는 글감', '◇', ideas.length, '다음 이야기를 위한 아이디어')}</div>
  <div class="dashboard-grid"><div><section class="panel"><div class="panel-head"><div><h2>최근 등록된 이야기</h2><p>글을 선택하면 요약과 본문을 볼 수 있어요.</p></div><button class="text-button" data-view="posts">모두 보기 ↗</button></div>${state.posts.slice(0, 5).map((p,i) => postRow(p,i)).join('') || '<div class="empty">등록된 글이 없습니다.</div>'}</section><section class="panel"><div class="panel-head"><h2>발행 준비 현황</h2><span class="text-button">로컬 파일 기준</span></div><div class="pipeline"><div class="stage"><span>01 &nbsp; 글감</span><b>${ideas.length}</b></div><div class="stage"><span>02 &nbsp; 초안</span><b>${state.drafts.length}</b></div><div class="stage"><span>03 &nbsp; 검수 작업</span><b>${review}</b></div><div class="stage"><span>04 &nbsp; 페이지 준비</span><b>${state.posts.filter(p => p.localPage).length}</b></div></div></section></div>
  <div class="right-column"><section class="panel brief"><div class="brief-title">✧ &nbsp; 오늘의 브리핑 <span>AT A GLANCE</span></div><h2>${running.length ? `${running.length}개의 작업이<br>진행되고 있어요.` : '다음 이야기를<br>준비할 시간이에요.'}</h2><p>${count}개의 글이 등록되어 있고,<br>${state.drafts.length ? `${state.drafts.length}개의 초안이 다음 단계를 기다립니다.` : `${ideas.length}개의 글감이 다음 이야기를 기다립니다.`}<br>공개 사이트 반영 여부는 별도 확인이 필요해요.</p><div class="brief-actions"><span>글 목록과 작업 기록 기준</span><button data-brief>편집장 요약 요청 ↗</button></div></section><section class="panel"><div class="panel-head"><h2>에이전트 활동</h2><span class="text-button">최근 작업</span></div><div class="activity">${recent.length ? recent.map(t => `<div class="activity-item"><button data-task="${t.id}"><strong>${esc(role(t.role).name)} · ${labels[t.status]}</strong><p>${esc(t.prompt.slice(0, 50))}</p><p>${time(t.createdAt)}</p></button></div>`).join('') : '<div class="empty">아직 진행한 작업이 없어요.<br>에이전트에게 첫 요청을 보내세요.</div>'}</div></section><section class="panel"><div class="panel-head"><h2>다음 글감</h2><button class="text-button" data-ideas>전체 보기 ↗</button></div><div class="ideas">${ideaRows(ideas.slice(0,3))}</div></section></div></div>`;
}
function openDialog(label) { $('#dialog-label').textContent = label; if (!$('#drawer').open) $('#drawer').showModal(); }
function compose(agent = 'editor', prompt = '', parentId = null) {
  selectedTask = null; pendingParent = parentId;
  $('#detail').innerHTML = `<h2 class="detail-title">어떤 일을 함께 할까요?</h2><p class="help-copy">담당 에이전트에게 명령을 보내면 이 Mac의 Codex가 작업합니다.</p><form id="task-form"><label for="agent-select">담당 에이전트</label><select id="agent-select">${state.roles.map(r => `<option value="${r.id}" ${r.id === agent ? 'selected' : ''}>${r.name} — ${r.description}</option>`).join('')}</select><div class="summary-box" id="role-purpose"><h3>이번 담당의 목표</h3><p>${esc(role(agent).mission)}</p><p class="help-copy">${esc(role(agent).identity)}</p></div><section class="role-prompt-panel"><strong id="role-prompt-status" role="status">역할 기본 지침 확인 중…</strong><p class="help-copy">기본 지침은 요청할 때 자동으로 함께 전달됩니다. 아래에는 이번에 맡길 업무만 적으세요.</p><details><summary>적용된 프롬프트 전체 보기</summary><p id="role-prompt-file" class="form-hint"></p><pre id="role-prompt-text" class="role-prompt-text">불러오는 중…</pre></details></section><label for="prompt">이번에 맡길 업무</label><textarea id="prompt" required maxlength="12000" placeholder="최근 글을 요약하고 다음 글감 3개를 추천해줘">${esc(prompt)}</textarea><label for="mode">작업 범위</label><select id="mode"><option value="read-only">확인과 요약 · 파일 변경 없음</option><option value="workspace-write">초안 작성과 수정 · 프로젝트 파일 변경 허용</option></select><p class="form-hint">${parentId ? '이전 작업의 요청과 결과를 함께 전달합니다. ' : ''}요청과 결과는 로컬에 저장되며 Codex에서도 확인할 수 있습니다. 실제 공개 발행은 발행 명령과 실행 결과로 확인하세요.</p><button class="primary full" type="submit" disabled>에이전트에게 명령 보내기 ↗</button><div id="form-error" class="form-error" role="alert"></div></form>`;
  openDialog('새 에이전트 작업');
  let promptRequest=0;
  const loadPrompt=async()=>{const serial=++promptRequest,r=$('#agent-select').value,panel=$('#role-prompt-text'),submit=$('#task-form button[type="submit"]');submit.disabled=true;$('#role-prompt-status').textContent='역할 기본 지침 확인 중…';$('#role-prompt-file').textContent='';panel.textContent='불러오는 중…';try{const data=await request(`/api/roles/${r}/prompt`);if(serial!==promptRequest||$('#role-prompt-text')!==panel)return;$('#role-prompt-status').textContent='✓ 역할 기본 지침 연결 확인';$('#role-prompt-file').textContent='연결된 파일: '+data.file;panel.textContent=data.text;submit.disabled=false;}catch(e){if(serial!==promptRequest||$('#role-prompt-text')!==panel)return;$('#role-prompt-status').textContent='기본 지침을 확인하지 못했습니다';panel.textContent=e.message+' · 창을 다시 열어 확인하세요.';}};
  loadPrompt();
  $('#agent-select').onchange=()=>{const r=role($('#agent-select').value);$('#role-purpose').innerHTML=`<h3>이번 담당의 목표</h3><p>${esc(r.mission)}</p><p class="help-copy">${esc(r.identity)}</p>`;loadPrompt();};
  $('#task-form').onsubmit = async e => { e.preventDefault(); const button = $('#task-form button'); button.disabled = true; try { const task = await request('/api/tasks', { role: $('#agent-select').value, prompt: $('#prompt').value, mode: $('#mode').value, parentId: pendingParent }); await refresh(); showTask(task.id); } catch(err) { $('#form-error').textContent = err.message; button.disabled = false; } };
}
function showPost(index, draft) {
  selectedTask = null; const p = (draft ? state.drafts : state.posts)[index]; if (!p) return;
  if(draft){const a=state.articles.find(a=>a.draftFile===`story/drafts/${p.id}`);if(a)return showReading(a.id);}
  $('#detail').innerHTML = `<h2 class="detail-title">${esc(p.title)}</h2><p class="detail-meta">${esc(p.date)} · ${draft ? '작성 중인 초안' : esc(p.author || 'B01호')}</p><div class="summary-box"><h3>한눈에 보는 요약</h3><p>${esc(p.summary || p.description || '저장된 요약이 없습니다.')}</p></div><div class="detail-actions"><button class="secondary" id="review-post">SEO 검수 요청</button><button class="secondary" id="summarize-post">상세 요약 요청</button></div><div class="reading">${draft?p.reading.html:esc(p.body || '저장된 본문이 없습니다.').split(/\n\n+/).map(p=>`<p>${p}</p>`).join('')}</div>`;
  openDialog(draft ? '초안 읽기' : '글과 요약');
  $('#review-post').onclick = () => compose('seo', `다음 글의 내용과 검색 최적화를 검수하고 개선점을 알려줘: ${p.title}${draft ? ` (story/drafts/${p.id})` : ''}`);
  $('#summarize-post').onclick = () => compose('editor', `다음 글을 핵심 3줄과 독자에게 유용한 점으로 요약해줘: ${p.title}`);
}
function showTask(id) { selectedTask = id; renderTask(id); openDialog('에이전트 작업 기록'); }
function renderTask(id) {
  const t = state.tasks.find(t => t.id === id); if (!t) return;
  const scroll = $('#detail .log')?.scrollTop;
  const wasOpen = $('#detail details')?.open;
  const clean = t.report?.summary || (t.result || '').replace(/\[\[(?:PROGRESS|DONE):[^\]]+\]\]/g, '').replace(/```editorial[\s\S]*?```/g, '').trim();
  $('#detail').innerHTML = `<h2 class="detail-title">${esc(role(t.role).name)}의 작업</h2><p class="detail-meta">${time(t.createdAt)} · ${t.source === 'codex' ? 'Codex에서 요청' : '브라우저에서 요청'}</p><div id="task-progress">${progressPanel(t)}</div>${t.articleId ? `<button class="secondary" data-article="${t.articleId}">이 글의 질문·사진·발행 단계 보기 →</button>` : ''}${t.error ? `<p class="form-error">${esc(t.error)}</p>` : ''}<div class="summary-box"><h3>${working(t) ? '최근 안내' : '결과 요약'}</h3><p>${esc(clean || (working(t) ? '첫 진행 신호를 기다리고 있습니다.' : '기록된 결과가 없습니다.'))}</p></div>${t.report?.checks?.length ? checksMarkup(t.report.checks) : ''}<div class="detail-actions">${working(t) ? '<button class="secondary" id="cancel-task">작업 중단</button>' : t.status==='waiting_input' && !t.articleId ? `<button class="primary" data-task-questions="${t.id}">질문 ${t.questions.length}개 확인하고 답하기 →</button>` : '<button class="primary" id="follow-task">이 결과로 이어서 요청</button>'}${t.status==='completed'&&!t.report?'<button class="secondary" id="structure-questions">결과를 구체적인 질문으로 정리 요청</button>':''}</div><details ${wasOpen?'open':''}><summary>요청 내용과 자세한 실행 기록</summary><p class="body-text">${esc(t.prompt)}</p><div class="log">${t.events.map(e=>`${time(e.at)}  ${esc(e.text)}`).join('\n') || '실행 준비 중'}</div></details>`;
  if (scroll != null) $('#detail .log').scrollTop = scroll;
  if ($('#cancel-task')) $('#cancel-task').onclick = async () => { try { await request(`/api/tasks/${id}/cancel`, {}); await refresh(); } catch(e) { $('#detail').insertAdjacentHTML('beforeend', `<p class="form-error">${esc(e.message)}</p>`); } };
  if ($('#follow-task')) $('#follow-task').onclick = () => compose(t.role, '', t.id);
  if ($('#structure-questions')) $('#structure-questions').onclick = () => compose(t.role, '위 결과에서 사람이 확인할 내용을 최대 6개의 구체적인 질문으로 정리하세요. 각 질문에 필요한 이유, 답변 예시, 사진이 필요하다면 촬영 대상을 넣어주세요. 파일을 수정하지 마세요.', t.id);
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el || !state) return;
  if (el.dataset.view) { view = el.dataset.view; render(); }
  if (el.dataset.agent) compose(el.dataset.agent);
  if (el.hasAttribute('data-post')) showPost(Number(el.dataset.post), el.dataset.draft === 'true');
  if (el.dataset.task) showTask(el.dataset.task);
  if (el.hasAttribute('data-brief')) compose('editor', '현재 블로그 글 목록, 글감과 초안을 읽고 전체 진행 상황, 최근 글의 핵심, 다음 할 일을 간결하게 요약해줘.');
  if (el.hasAttribute('data-ideas')) { view = 'posts'; tab = 'ideas'; render(); }
  if (el.dataset.tab) { tab = el.dataset.tab; render(); }
  if (el.dataset.idea) { const i = state.ideas.find(i => i.id === el.dataset.idea); compose('writer', `이 글감으로 브랜드 기준에 맞는 초안을 작성해줘. 사실 확인이 필요한 경험은 먼저 질문해줘: ${i.title}`); }
});
$('#new-task').onclick = () => state && compose();
$('#refresh').onclick = refresh;
$('#close').onclick = () => $('#drawer').close();
$('#drawer').addEventListener('close', () => { selectedTask = null; });
$('#help').onclick = () => { selectedTask = null; $('#detail').innerHTML = `<h2 class="detail-title">Codex에서도 이어서 일하세요.</h2><p class="help-copy">이 프로젝트의 Codex 대화에서 다음처럼 요청하세요.</p><div class="summary-box"><p>“편집실의 진행 상황을 확인해줘.”<br>“편집실 작가에게 다음 글 초안을 요청해줘.”</p></div><p class="help-copy">Codex는 편집실 명령 도구를 사용합니다. 브라우저와 같은 작업 기록에 표시됩니다.</p><code>node local-console/cli.mjs status<br>node local-console/cli.mjs send editor "최근 글 요약해줘"<br>node local-console/cli.mjs send writer "다음 글의 초안을 작성해줘" --write</code><p class="help-copy">브라우저에서 보낸 명령은 로컬 Codex CLI 세션으로 실행됩니다. 기존 데스크톱 대화에 메시지를 직접 넣는 방식은 아닙니다. 결과는 이 편집실에 모이고, Codex 대화에서도 확인할 수 있습니다.</p>`; openDialog('Codex 연결 안내'); };
setInterval(refresh, 3000);
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
  register({ name: 'read_editorial_status', description: 'Read the local blog inventory and agent task status.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: async () => { await refresh(); return { posts: state.posts.length, drafts: state.drafts.length, tasks: state.tasks.map(t => ({ id: t.id, role: t.role, status: t.status })) }; } });
  register({ name: 'start_editorial_task_composer', description: 'Open the agent command composer. Does not submit or execute a task.', inputSchema: { type: 'object', properties: { role: { type: 'string', enum: ['editor','writer','seo','publisher'] }, prompt: { type: 'string', maxLength: 12000 } }, required: ['role','prompt'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async input => { if (!state) await refresh(); if (!state.roles.some(r => r.id === input?.role) || typeof input.prompt !== 'string' || input.prompt.length > 12000) throw new Error('Invalid input'); compose(input.role, input.prompt); return { opened: true, submitted: false }; } });
  addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
