import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readReport,taskProgress,createWeek} from './workflow.mjs';
test('progress reflects evidence and staleness, never invented percentages',()=>{
  const now=Date.parse('2026-09-07T00:00:00Z');
  const task={role:'seo',status:'running',createdAt:new Date(now-180000).toISOString(),startedAt:new Date(now-180000).toISOString(),lastEventAt:new Date(now-100000).toISOString(),stage:'checks',doneStages:['context','content']};
  const p=taskProgress(task,now);assert.equal(p.stale,true);assert.equal(p.completedCount,2);assert.equal(p.elapsedSeconds,180);assert.equal(p.stages[2].status,'active');
  const done=taskProgress({...task,status:'completed',finishedAt:new Date(now).toISOString()},now+60000);assert.equal(done.elapsedSeconds,180);assert.equal(done.stages[3].status,'pending');
});
test('parses structured questions and rejects malformed reports',()=>{
  assert.equal(readReport('일반 텍스트 결과'),null);assert.equal(readReport('```editorial\n{}\n```'),null);
  const report=readReport('```editorial\n'+JSON.stringify({outcome:'needs_input',summary:'질문',questions:[{label:'사진 있나요?',help:'직접 찍은 사진',required:true}]})+'\n```');
  assert.equal(report.questions.length,1);assert.equal(report.questions[0].answer,'');
  assert.equal(readReport('```editorial\n'+JSON.stringify({outcome:'needs_input',summary:'질문',questions:[]})+'\n```'),null);
});
test('week validates real calendar dates and monday start',()=>{
  assert.throws(()=>createWeek('2026-02-30'));assert.throws(()=>createWeek('2026-09-15'));assert.equal(createWeek('2026-09-14')[6].date,'2026-09-20');
});

import {refreshDraftQuestions,conversationBrief} from './workflow.mjs';
test('refreshes unanswered prompts without losing user answers and keeps conservative empty fallback',()=>{
 const answered={id:'a',label:'어디서?',answer:'공원',required:true};
 const old={id:'b',label:'옛 질문',answer:'',required:true};
 const fresh={id:'c',label:'산책 장면부터 시작하면 어떨까요?',answer:'',required:false};
 assert.deepEqual(refreshDraftQuestions([answered,old],[fresh]),[answered,fresh]);
 assert.deepEqual(refreshDraftQuestions([answered,old],[]),[answered,old]);
 assert.deepEqual(conversationBrief([{id:'1',category:'취미',title:'산책',questions:[answered,old]},{id:'2',category:'가구',questions:[answered]}],{id:'3',category:'취미'}),[{articleId:'1',title:'산책',answers:[{question:'어디서?',answer:'공원'}]}]);
});
