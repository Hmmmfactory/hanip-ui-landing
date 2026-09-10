import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readDraft,normalizeFormat} from './reading.mjs';
test('reader removes frontmatter, comments and machine blocks while retaining unresolved facts',()=>{
 const r=readDraft('---\ntitle: private\n---\n# 제목\n\n**강조**와 [링크](javascript:alert)\n\n> [확인 필요] 경험\n\n<!-- hidden -->\n\n```editorial\n{"private":true}\n```\n\n<script>bad()</script>');
 assert.ok(!r.html.includes('private'));assert.ok(!r.html.includes('hidden'));assert.ok(!r.html.includes('<script>'));assert.ok(!r.html.includes('href="javascript'));assert.ok(r.html.includes('<strong>강조</strong>'));assert.equal(r.needsConfirmation,true);
});
test('reader supports paragraphs, lists, tables and safe story links',()=>{
 const r=readDraft('문단 첫 줄\n다음 줄\n\n- 항목 1\n- 항목 2\n\n| 기준 | 값 |\n| --- | --- |\n| 폭 | 확인 필요 |\n\n[관련 글](../story.html)','https://example.com');
 assert.ok(r.html.includes('<ul><li>'));assert.ok(r.html.includes('<table>'));assert.ok(r.html.includes('https://example.com/story/story.html'));assert.ok(r.html.includes('첫 줄\n다음 줄'));assert.throws(()=>normalizeFormat({spacing:'unsafe'}));
});
test('existing HTML links render as links and explicit non-public editor sections stay hidden',()=>{
 const r=readDraft('# 제목\n\n<a href="https://example.com" rel="noopener">프로필</a>\n\n---\n\n편집 메모 — 본문 외, 공개 시 제외\n\nSEO 관리 정보');
 assert.ok(r.html.includes('<h1>제목</h1>'));assert.ok(r.html.includes('href="https://example.com/"'));assert.ok(!r.html.includes('SEO 관리 정보'));assert.ok(!r.html.includes('&lt;a'));
});

test('confirmation paragraphs are private, absent from public HTML and summary, and still block publication',()=>{
 const r=readDraft('# 제목\n\n확인된 장면으로 쓴 본문입니다.\n\n매일 3시간 사용했다. [확인 필요] 실제 사용 시간인가요?\n\n[미확인] 구매 가격\n\n다음 공개 문단입니다.');
 assert.equal(r.needsConfirmation,true);
 assert.equal(r.privateNotes.length,2);
 assert.match(r.privateNotes[0],/실제 사용 시간/);
 for(const output of [r.html,r.plain,r.summary]){
   assert.doesNotMatch(output,/확인 필요|미확인|매일 3시간|구매 가격/);
 }
 assert.match(r.html,/다음 공개 문단/);
});
