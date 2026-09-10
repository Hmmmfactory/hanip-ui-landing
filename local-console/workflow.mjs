import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const STAGES = {
  editor: [['context','기존 글 확인'],['content','글감·일정 구성'],['checks','중복·방향 검토'],['result','결과 정리']],
  writer: [['context','자료·답변 확인'],['content','초안 작성'],['checks','사실·구성 점검'],['result','초안 저장']],
  seo: [['context','대상·기준 확인'],['content','본문·사실 검수'],['checks','검색 요소 검수'],['result','검수 결과 정리']],
  publisher: [['context','승인·일정 확인'],['content','발행 파일 준비'],['checks','배포·URL 확인'],['result','발행 결과 정리']],
};
export function readReport(text = '') {
  const match = text.match(/```editorial\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]);
    if (!['ready','needs_input','changes_requested'].includes(raw.outcome) || typeof raw.summary !== 'string') return null;
    const questions = (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 10).filter(q => typeof q.label === 'string' && q.label.trim()).map(q => ({ id: randomUUID(), label: q.label.slice(0,300), help: String(q.help || '').slice(0,1500), example: String(q.example || '').slice(0,500), required: q.required !== false, answer: '' }));
    if (raw.outcome === 'needs_input' && !questions.length) return null;
    const checks = (Array.isArray(raw.checks) ? raw.checks : []).filter(c => typeof c.label === 'string' && ['pass','fail','na'].includes(c.status)).map(c => ({ label: c.label.slice(0,200), status:c.status, evidence:String(c.evidence || '').slice(0,1200) })).slice(0,30);
    return { outcome:raw.outcome, summary:raw.summary.slice(0,12000), questions, checks, draftFile:typeof raw.draftFile === 'string' ? raw.draftFile : null, publishedUrl:typeof raw.publishedUrl === 'string' ? raw.publishedUrl : null };
  } catch { return null; }
}
export function taskProgress(task, now = Date.now()) {
  const lastAt = task.lastEventAt || task.events?.at(-1)?.at || task.startedAt || task.createdAt;
  const quietSeconds = Math.max(0, Math.floor((now - Date.parse(lastAt))/1000));
  const elapsedSeconds = Math.max(0, Math.floor(((task.finishedAt ? Date.parse(task.finishedAt) : now) - Date.parse(task.startedAt || task.createdAt))/1000));
  const stages = (STAGES[task.role] || STAGES.editor).map(([id,label]) => ({ id, label, status:task.doneStages?.includes(id) ? 'done' : task.stage === id && task.status === 'running' ? 'active' : 'pending' }));
  let guidance = '순서가 되면 자동으로 시작합니다.';
  if (task.status === 'running') guidance = quietSeconds >= 90 ? '새 진행 신호가 한동안 없습니다. 실행 프로세스는 유지 중이지만 실제 진행 여부는 확인되지 않았습니다. 기록을 확인하거나 중단 후 다시 요청할 수 있습니다.' : 'Codex의 진행 신호를 받고 있습니다. 지금은 기다리셔도 됩니다. 다른 글의 자료를 준비할 수 있습니다.';
  if (task.status === 'waiting_input') guidance = task.articleId ? '추가 확인이 필요합니다. 이 글의 업무 화면에서 전체 질문 수와 사진 안내를 확인하세요.' : `답변이 필요합니다. 남은 질문 ${task.questions?.filter(q => q.required && !q.answer?.trim()).length || 0}개를 확인하세요.`;
  if (task.status === 'completed') guidance = task.report?.outcome === 'changes_requested' ? '검수가 끝났고 수정할 항목이 있습니다. 결과를 확인하고 수정을 요청하세요.' : '작업이 끝났습니다. 결과와 다음 단계를 확인하세요.';
  if (['failed','interrupted','cancelled'].includes(task.status)) guidance = '작업이 멈췄습니다. 남은 변경과 오류를 확인한 뒤 다시 요청하세요.';
  return { tracked:Array.isArray(task.doneStages), stages, quietSeconds, elapsedSeconds, lastAt, stale:task.status === 'running' && quietSeconds >= 90, guidance, current:task.activity || (task.status === 'running' ? 'Codex 응답 준비' : ''), completedCount:stages.filter(s => s.status === 'done').length };
}
export const WEEK_TOPICS = [
  ['가구','책상 위가 늘 가득할 때, 무엇부터 자리를 바꿔볼까요?','책상에서 반복되는 동작과 꼭 남길 물건을 관찰하는 이야기'],
  ['가구','의자가 불편할 때, 새로 사기 전에 무엇을 살펴볼까요?','앉는 시간과 자세, 공간에 맞는 의자를 고르는 나만의 기준'],
  ['가구','침대 옆 작은 공간에는 어떤 가구를 두면 좋을까요?','잠들기 전 손이 가는 물건을 기준으로 협탁 자리를 정하는 이야기'],
  ['가구','작은 방의 식탁은 어떤 순간에 가장 쓸모가 있을까요?','혼자 먹는 식사와 다른 활동 사이에서 식탁의 쓰임을 기록'],
  ['가구','책장을 정리할 때, 남길 칸은 어떻게 고를까요?','물건 수보다 사용 빈도와 취향을 기준으로 책장을 정리하는 이야기'],
  ['취미','요즘 즐기는 취미는 일상에 어떤 변화를 주나요?','실내·야외·운동·여행·모임 등 장소에 제한 없이 실제 즐기는 취미 하나의 경험'],
  ['소비·예산','취미 지출을 돌아볼 때, 무엇을 기록하면 좋을까요?','장소에 제한 없이 실제 소비 기록과 만족도를 돌아보는 이야기. 저축·투자 학습·자산 관리로도 주제 변경 가능. 경험과 수익률을 지어내지 않음'],
];
export function createWeek(startDate, existing = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(startDate+'T00:00:00Z'))) throw new Error('올바른 시작 날짜를 입력하세요.');
  const start = new Date(startDate+'T00:00:00Z');
  if (start.toISOString().slice(0,10) !== startDate || start.getUTCDay() !== 1) throw new Error('주간 계획은 월요일부터 시작합니다.');
  if (existing.some(a => a.week === startDate)) throw new Error('이미 이 주의 계획이 있습니다. 기존 계획을 수정하세요.');
  return WEEK_TOPICS.map(([category,title,angle], index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate()+index);
    const article = { id:randomUUID(), week:startDate, date:date.toISOString().slice(0,10), publishTime:'09:00', category,title,angle,owner:'', status:'planned', revision:0, draftFile:null, review:null, approvedAt:null, scheduledAt:null, taskIds:[], images:[], questions:[
      {id:randomUUID(),label:'어떤 공간과 물건에 관한 이야기인가요?',help:'독자가 장면을 떠올릴 수 있게 공간, 물건, 사용 목적을 알려주세요.',example:'방 창가의 100cm 책상에서 퇴근 후 글을 씁니다.',required:true,answer:''},
      {id:randomUUID(),label:'직접 겪은 불편이나 바뀐 점은 무엇인가요?',help:'실제로 겪은 일만 적어주세요. 아직 경험하지 않았다면 그렇게 답해도 됩니다. 그 경우 발행 전에 경험 확인이 필요합니다.',example:'컵을 두면 마우스 자리가 좁아서, 일주일 동안 컵 위치를 바꿔봤습니다.',required:true,answer:''},
      {id:randomUUID(),label:'꼭 담고 싶은 기준이나 확인 가능한 사실은 무엇인가요?',help:'치수·가격은 확인된 값만 적고, 출처가 있으면 URL을 적어주세요. 모르는 내용은 모른다고 적습니다.',example:'제품명과 치수는 아직 확인하지 않았습니다. 물건을 덜 두는 기준에 집중하고 싶습니다.',required:true,answer:''},
    ], photoBrief:category === '가구' ? '① 물건과 주변 동선이 함께 보이는 전체 사진 ② 실제 불편한 지점의 가까운 사진 ③ 배치를 바꿨다면 전후를 같은 각도에서 찍은 사진. 사람 얼굴·주소는 제외하세요.' : category === '취미' ? '① 실제 취미를 즐기는 공간 전체 ② 자주 쓰는 도구나 결과물. 직접 촬영한 사진을 준비하세요.' : '개인 식별 정보와 계좌번호를 가린 소비 기록 또는 실제 사용하는 예산 노트. 금액 공개가 부담되면 항목만 보이게 찍으세요.', photoDecision:'pending', createdAt:new Date().toISOString() };
    return applyWeekendBrief(article);
  });
}
export function applyWeekendBrief(article) {
  if (!['취미', '소비·예산'].includes(article.category)) return article;
  const hobby = article.category === '취미';
  const prompts = hobby ? [
    ['어떤 취미를 언제, 어디서 즐기나요?', '실내·야외·운동·여행·모임 모두 가능합니다. 실제 활동과 함께하는 사람, 빈도를 알려주세요.', '예: 주말에 공원에서 달리거나 동네 모임에서 활동합니다. 실제 경험에 맞게 답해주세요.'],
    ['직접 해보며 느낀 점이나 달라진 점은 무엇인가요?', '시작 계기와 기억에 남는 장면을 알려주세요. 아직 시작 전이라면 그대로 적어주세요.', '예: 아직 시작 전이라 준비 과정과 기대하는 점을 소개하고 싶습니다.'],
    ['독자에게 알려주고 싶은 준비물이나 참여 기준은 무엇인가요?', '도구·이동·시간·비용 등 해당하는 내용만 적고 확인한 정보에는 출처를 붙여주세요.', '예: 준비물은 확인했지만 참가비는 아직 확인하지 못했습니다.']
  ] : [
    ['어떤 소비·저축·투자 학습·자산 관리 이야기를 다룰까요?', '장소와 관계없는 주제입니다. 다루고 싶은 항목과 목적을 알려주세요.', '예: 외출·여행 지출을 돌아보거나 저축 목표를 세우는 과정을 다루고 싶습니다.'],
    ['직접 기록하거나 실행한 내용은 무엇인가요?', '실제 경험과 앞으로의 계획을 구분해주세요. 공개 가능한 범위만 답하면 됩니다.', '예: 한 달 소비 항목을 기록했고, 저축 계획은 아직 실행 전입니다.'],
    ['확인 가능한 자료와 공개할 범위는 어디까지인가요?', '금액·기간·정보 출처를 확인하고, 모르는 내용은 미확인이라고 적어주세요.', '예: 실제 금액은 공개하지 않고 항목별 판단 기준만 공유하고 싶습니다.']
  ];
  article.questions = prompts.map(([label, help, example], i) => ({...article.questions[i], label, help, example}));
  article.photoBrief = hobby
    ? '실제 활동이 드러나는 장소나 장면, 준비물·도구·결과물 사진. 야외·운동·여행·모임 사진도 가능합니다. 집 안 사진은 필수가 아닙니다. 직접 촬영하거나 사용 권한이 있는 사진을 준비하세요.'
    : '주제와 관련된 소비·저축 기록, 예산표, 학습 메모 또는 실제 활동 사진. 장소에 제한이 없으며 방 사진은 필요하지 않습니다. 개인정보·계좌번호는 가리고 공개할 수 있는 자료만 준비하세요.';
  return article;
}
export function articleStatus(a, tasks) {
  const task = tasks.find(t => t.id === a.taskIds.at(-1));
  const required = a.questions.filter(q => q.required && !q.answer?.trim()).length;
  let next = '질문에 답하고 사진 사용 여부를 정하세요.';
  if (a.status === 'planned') next = '초안 준비를 요청하세요. 답변 전에는 확인할 부분이 남은 초안을 작성합니다.';
  if (a.status === 'draft_ready' && a.draftRevision!==undefined && a.draftRevision!==a.revision) next = '저장한 답변·설정을 반영해 초안을 보완하세요.';
  else if (a.status === 'draft_ready') next = required ? `질문 ${required}개에 답한 뒤 초안을 보완하세요.` : 'SEO 검수를 요청하세요.';
  if (a.status === 'needs_input') next = `질문 ${required}개를 확인하고 답변을 전달하세요.`;
  if (a.status === 'changes_requested') next = '검수 결과에서 수정할 부분을 확인하고 초안 수정을 요청하세요.';
  if (a.status === 'reviewed') next = a.photoDecision === 'pending' ? '사진 첨부 또는 사진 없이 발행을 선택하세요.' : '최종 원고를 확인하고 발행을 승인하세요.';
  if (a.status === 'approved') next = '예약 시간을 정하고 예약 발행을 켜세요.';
  if (a.status === 'scheduled') next = '예약 시각에 Mac과 편집실이 켜져 있어야 합니다.';
  if (a.status === 'missed') next = '예약 시각을 6시간 넘겼습니다. 새 시간을 정하고 다시 예약하세요.';
  if (a.status === 'published') next = '공개 주소에서 발행 결과를 확인하세요.';
  if (a.status === 'failed') next = '작업 오류를 확인하고 해당 단계를 다시 요청하세요.';
  if (a.status === 'publishing') next = '배포 후 공개 주소를 확인하고 있습니다.';
  if (task && ['queued','running'].includes(task.status)) next = task.status === 'queued' ? '앞선 작업이 끝나면 자동으로 시작합니다.' : taskProgress(task).guidance;
  if(a.publicationWindow?.status==='blocked')next='텔레그램 연결 후 발행 확인 알림을 보내야 합니다.';
  if(a.publicationWindow?.status==='waiting')next='텔레그램 확인 알림을 보냈습니다. 1시간 내 발행·보류를 선택하세요. 응답이 없으면 자동 발행합니다.';
  if(a.publicationWindow?.status==='held')next='발행이 보류되었습니다. 다시 요청하기 전에는 자동 발행하지 않습니다.';
  return {...a, requiredQuestions:required, next, currentTaskId:task?.id};
}
export function workflowStore(dataDir) {
  const file = path.join(dataDir,'workflow.json');
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : { articles:[] };
  return { data, save() { fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2),{mode:0o600}); fs.renameSync(file+'.tmp',file); } };
}

// Preserve human answers; refresh unanswered prompts rather than accumulating them.
export function refreshDraftQuestions(previous, generated) {
  if (!generated.length) return previous;
  const answered = previous.filter(q => q.answer?.trim());
  return [...answered, ...generated.filter(q => !answered.some(old => old.label === q.label))];
}
export function conversationBrief(articles, current) {
  return articles.filter(a => a.id !== current.id && a.category === current.category)
    .slice(-12).map(a => ({articleId:a.id, title:a.title, answers:a.questions
      .filter(q => q.answer?.trim()).map(q => ({question:q.label, answer:q.answer}))}))
    .filter(a => a.answers.length);
}
