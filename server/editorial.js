const { github, file, commitFiles, addLabel, removeLabel } = require('./github');
const { auditEditorialPr, isEditorialPath } = require('./editorial-audit');
const { scoreEditorial } = require('./editorial-score');
const { sendEditorialReport, sendEditorialNotice } = require('./editorial-report');

function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function stateFrom(body) {
  const match = String(body || '').match(/<!-- editorial-state:([A-Za-z0-9+/=]+) -->/);
  if (!match) return null;
  try { return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')); } catch (_) { return null; }
}
function withState(body, state) { return `${String(body || '').replace(/<!-- editorial-state:[\s\S]*? -->\n?/, '')}\n\n<!-- editorial-state:${Buffer.from(JSON.stringify(state)).toString('base64')} -->`; }
function toHtml(body) {
  return String(body || '').split(/\n\s*\n/).map((part) => {
    if (part.startsWith('## ')) return `<h2>${escapeHtml(part.slice(3))}</h2>`;
    if (/^(?:- .+\n?)+$/.test(part)) return `<ul>${part.split('\n').filter(Boolean).map((line) => `<li>${escapeHtml(line.slice(2))}</li>`).join('')}</ul>`;
    return `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}
function articlePage(post) {
  const site = String(process.env.SITE_URL || '').replace(/\/$/, '');
  const url = `${site}/story/${post.slug}.html`;
  const faq = Array.isArray(post.faq) ? post.faq : [];
  const sourceHtml = (post.sources || []).map((s) => `<li><a href="${escapeHtml(s.url)}" rel="noopener">${escapeHtml(s.title)}</a></li>`).join('');
  const faqHtml = faq.map((item) => `<details><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`).join('');
  const schema = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.date, dateModified: post.updated || post.date, author: { '@type': 'Person', name: post.author }, mainEntityOfPage: url, keywords: post.tags.join(', ') };
  const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '홈', item: `${site}/` }, { '@type': 'ListItem', position: 2, name: '이야기', item: `${site}/story/` }, { '@type': 'ListItem', position: 3, name: post.title, item: url }] };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(post.title)} | B01호</title><meta name="description" content="${escapeHtml(post.description)}"><meta name="author" content="${escapeHtml(post.author)}"><link rel="canonical" href="${url}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(post.title)}"><meta property="og:description" content="${escapeHtml(post.description)}"><meta property="og:url" content="${url}"><link rel="stylesheet" href="story.css"><script type="application/ld+json">${JSON.stringify(schema)}</script>${faq.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) })}</script>` : ''}<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script></head><body><main id="main"><article><header><p>${post.date} · ${escapeHtml(post.author)}</p><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.summary)}</p></header>${toHtml(post.body)}${faqHtml ? `<section class="faq"><h2>자주 묻는 질문</h2>${faqHtml}</section>` : ''}${sourceHtml ? `<section class="sources"><h2>출처</h2><ul>${sourceHtml}</ul></section>` : ''}</article></main></body></html>`;
}
function publicationFiles(post, sitemap, feed, llms) {
  const site = String(process.env.SITE_URL || '').replace(/\/$/, '');
  const url = `${site}/story/${post.slug}.html`;
  const xml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  const lastmod = `<url><loc>${xml(url)}</loc><lastmod>${post.updated || post.date}</lastmod></url>`;
  const item = `<item><title>${xml(post.title)}</title><link>${xml(url)}</link><description>${xml(post.summary)}</description><pubDate>${new Date(`${post.date}T00:00:00+09:00`).toUTCString()}</pubDate><guid isPermaLink="true">${xml(url)}</guid></item>`;
  const llmEntry = `- [${post.title}](${url}): ${post.summary}`;
  return {
    sitemap: sitemap.replace(/<\/urlset>\s*$/, `${lastmod}\n</urlset>\n`),
    feed: feed.replace(/(<channel[^>]*>)/, `$1\n    ${item}`),
    llms: llms.replace(/(## 이야기\(블로그\)\n)/, `$1${llmEntry}\n`)
  };
}
async function attachEditorialLabel(number) {
  return addLabel(number, 'editorial-review', { color: 'D4A72C', description: 'Telegram 편집장 검토가 필요한 블로그 초안' });
}
async function createDraft(topic) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const contextFiles = await Promise.all(['story/brand.md', 'story/ideas.md', 'story/posts.json'].map((path) => file(path, 'main').then((item) => item.text).catch(() => '')));
  const ideas = contextFiles[1];
  const nextIdea = ideas.match(/^- \[ \] (.+)$/m)?.[1];
  const selectedTopic = topic || nextIdea || '작은 공간에서 가구를 고르기 전에 확인할 기준은 무엇인가요?';
  const recentPosts = (() => { try { return JSON.stringify(JSON.parse(contextFiles[2]).slice(0, 3)); } catch (_) { return '[]'; } })();
  const prompt = `You write factual Korean blog drafts for B01호, a 5-pyeong semi-basement home living record. Topic: ${selectedTopic}. Use only facts present in BRAND CONTEXT and RECENT POSTS. Never invent a first-person experience, measurement, statistic, product result, testimonial, or source. If the context cannot support a claim, omit it. Return ONLY valid JSON with title (Korean question ending in ?, <=60 chars), slug (lowercase hyphenated English), summary, description (80-150 Korean chars), tags (array), body (1200-1800 Korean characters; answer directly in the first 2-3 sentences; paragraphs separated by blank lines; 3-5 ## headings; include a list when explaining criteria; end with one real profile/follow CTA), faq (exactly 3 {q,a}), sources (at least one real {title,url}).\n\nBRAND CONTEXT:\n${contextFiles[0]}\n\nRECENT POSTS:\n${recentPosts}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', input: prompt }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : 'OpenAI draft request failed.');
  const text = data.output_text || (data.output || []).flatMap((x) => x.content || []).map((x) => x.text || '').join('');
  const post = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  post.id = post.slug; post.date = today; post.url = `${post.slug}.html`; post.author = process.env.EDITORIAL_AUTHOR || '진짜 사용해본 찐후기 B01호';
  return post;
}
async function createDraftPr(topic, options = {}) {
  const post = await createDraft(topic);
  const main = await github('/git/ref/heads/main'); const branch = `editorial/${options.test ? 'test-' : ''}${post.slug}-${Date.now()}`;
  await github('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main.object.sha }) });
  const [postsFile, sitemapFile, feedFile, llmsFile] = await Promise.all([file('story/posts.json', 'main'), file('sitemap.xml', 'main'), file('feed.xml', 'main'), file('llms.txt', 'main')]);
  const posts = JSON.parse(postsFile.text); posts.unshift({ id: post.id, title: post.title, date: post.date, summary: post.summary, tags: post.tags, body: post.body, url: post.url, description: post.description, author: post.author, faq: post.faq, sources: post.sources });
  const publication = publicationFiles(post, sitemapFile.text, feedFile.text, llmsFile.text);
  await commitFiles(branch, [
    { path: `story/${post.slug}.html`, text: articlePage(post) },
    { path: 'story/posts.json', text: JSON.stringify(posts, null, 2) + '\n' },
    { path: 'sitemap.xml', text: publication.sitemap },
    { path: 'feed.xml', text: publication.feed },
    { path: 'llms.txt', text: publication.llms }
  ], `editorial: add ${post.slug} review draft`);
  const state = { title: post.title, slug: post.slug, score: 0, failures: ['GitHub 웹훅 검수 대기 중'], status: 'pending-review', test: Boolean(options.test), createdAt: new Date().toISOString() };
  const testNotice = options.test ? '\n\n이 PR은 자동화 테스트용이며 승인·자동발행할 수 없습니다.' : '';
  const prBody = `이 PR이 블로그 초안의 원본입니다. main에 병합되기 전에는 Production 사이트에 발행되지 않습니다.${testNotice}\n\n함께 검토할 파일:\n- story/${post.slug}.html\n- story/posts.json\n- sitemap.xml\n- feed.xml\n- llms.txt\n\nTelegram에서 승인·보류하거나 자연어 수정 요청을 남길 수 있습니다.`;
  const prefix = options.test ? '[Editorial Test]' : '[Editorial]';
  const pr = await github('/pulls', { method: 'POST', body: JSON.stringify({ title: `${prefix} ${post.title}`, head: branch, base: 'main', body: withState(prBody, state) }) });
  await attachEditorialLabel(pr.number);
  return pr;
}
async function setEditorialStatus(number, status) {
  const pr = await github(`/pulls/${number}`);
  const state = stateFrom(pr.body);
  if (!state) throw new Error('This pull request is not an editorial draft.');
  state.status = status; state.updatedAt = new Date().toISOString();
  const updated = await github(`/pulls/${number}`, { method: 'PATCH', body: JSON.stringify({ body: withState(pr.body, state) }) });
  return { pr: updated, state };
}
async function approveAndMerge(number) {
  const current = await github(`/pulls/${number}`);
  const before = stateFrom(current.body);
  const labels = (current.labels || []).map((label) => label.name);
  if (!before || !labels.includes('editorial-review')) throw new Error('This pull request is not an editorial draft.');
  if (before.test) throw new Error('Cannot merge: test drafts are never publishable.');
  if (String(process.env.EDITORIAL_APPROVAL_ENABLED).toLowerCase() !== 'true') throw new Error('Manual PR merge is disabled. Set EDITORIAL_APPROVAL_ENABLED=true after completing test runs.');
  if (labels.includes('editorial:hold') || before.status === 'held') throw new Error('Cannot merge: this draft is on hold. Use recheck to resume it.');
  const state = await reviewEditorialPr(current, { force: true, notify: false });
  const threshold = Number(process.env.AUTOPUBLISH_SCORE_THRESHOLD || 90);
  if (!Array.isArray(state.failures) || state.failures.length || state.score < threshold) throw new Error(`Cannot merge: score must be ${threshold}+ and every rule must pass.`);
  const latest = await github(`/pulls/${number}`);
  if (!state.reviewedCommitSha || latest.head.sha !== state.reviewedCommitSha) throw new Error('Cannot merge: the PR changed after final review.');
  const { pr } = await setEditorialStatus(number, 'approved');
  const merged = await github(`/pulls/${number}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'squash', commit_title: pr.title }) });
  if (!merged.merged) throw new Error(merged.message || 'GitHub did not merge the PR.');
  return { pr, state, merged };
}
async function reviseDraft(number, instruction) {
  if (!/^\d+$/.test(String(number))) throw new Error('PR 번호가 올바르지 않습니다.');
  if (!instruction || instruction.length > 1000) throw new Error('수정 요청은 1~1,000자로 작성해 주세요.');
  const pr = await github(`/pulls/${number}`);
  const labels = (pr.labels || []).map((label) => label.name);
  if (pr.state !== 'open' || pr.base?.ref !== 'main' || !labels.includes('editorial-review')) throw new Error('수정할 수 있는 editorial-review PR이 아닙니다.');
  const state = stateFrom(pr.body);
  if (!state || !['review', 'held'].includes(state.status)) throw new Error('현재 검수가 끝난 뒤 다시 수정해 주세요.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.slug || '')) throw new Error('안전하지 않은 slug라서 수정할 수 없습니다.');
  const postsFile = await file('story/posts.json', pr.head.ref);
  const [sitemapFile, feedFile, llmsFile] = await Promise.all([file('sitemap.xml', pr.head.ref), file('feed.xml', pr.head.ref), file('llms.txt', pr.head.ref)]);
  const posts = JSON.parse(postsFile.text); const index = posts.findIndex((item) => item.slug === state.slug || item.id === state.slug);
  if (index < 0) throw new Error('PR에서 초안 데이터를 찾지 못했습니다.');
  const old = posts[index];
  const prompt = `Revise this Korean blog draft according to the editor request. Keep slug, date, author and all factual claims conservative. Return ONLY valid JSON with title, summary, description, tags, body, faq, sources. Preserve SEO constraints: title <=60 chars, description 80-150 Korean chars, body >=1000 Korean chars with 3-5 ## headings, exactly 3 FAQ, at least one real source. Do not invent statistics, testimonials, product performance, or citations.\n\nEDITOR REQUEST: ${instruction}\n\nDRAFT:\n${JSON.stringify(old)}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', input: prompt }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : 'OpenAI revision failed.');
  const text = data.output_text || (data.output || []).flatMap((x) => x.content || []).map((x) => x.text || '').join('');
  const changed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  const updatedDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const post = { ...old, ...changed, id: old.id, slug: state.slug, url: old.url, date: old.date, updated: updatedDate, author: old.author };
  posts[index] = post;
  const url = `${String(process.env.SITE_URL || '').replace(/\/$/, '')}/story/${state.slug}.html`;
  const fresh = publicationFiles(post, '</urlset>', '<channel>', '## 이야기(블로그)\n');
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sitemap = sitemapFile.text.replace(new RegExp(`<url><loc>${escapedUrl}</loc>[\\s\\S]*?<\\/url>`), fresh.sitemap.replace(/\n?<\/urlset>\n?$/, ''));
  const feed = feedFile.text.replace(new RegExp(`<item>[\\s\\S]*?<guid isPermaLink="true">${escapedUrl}<\\/guid><\\/item>`), fresh.feed.replace(/^<channel>\n\s*/, ''));
  const llms = llmsFile.text.replace(new RegExp(`^- \\[[^\\]]+\\]\\(${escapedUrl}\\):.*$`, 'm'), `- [${post.title}](${url}): ${post.summary}`);
  Object.assign(state, { title: post.title, score: 0, scoreBreakdown: {}, failures: ['GitHub 웹훅 재검수 대기 중'], status: 'pending-review', headSha: null, reviewedCommitSha: null, reviewedAt: null, previewUrl: null, pendingPreviewUrl: null, previewReadyAt: null, updatedAt: new Date().toISOString() });
  const updated = await github(`/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ title: `[Editorial] ${post.title}`, body: withState(pr.body, state) }) });
  const edits = [
    { path: `story/${state.slug}.html`, text: articlePage(post) },
    { path: 'story/posts.json', text: JSON.stringify(posts, null, 2) + '\n' },
    { path: 'sitemap.xml', text: sitemap },
    { path: 'feed.xml', text: feed },
    { path: 'llms.txt', text: llms }
  ];
  const forbidden = edits.map((item) => item.path).filter((path) => !isEditorialPath(path));
  if (forbidden.length) throw new Error(`Telegram 수정 금지 파일: ${forbidden.join(', ')}`);
  await removeLabel(number, 'editorial:hold');
  await commitFiles(pr.head.ref, edits, `editorial: revise ${state.slug}`);
  return updated;
}
async function reviewEditorialPr(pr, options = {}) {
  const previousState = stateFrom(pr.body);
  if (!options.force && previousState?.status === 'review' && previousState.reviewedCommitSha === pr.head.sha && previousState.reviewedAt) return previousState;
  const audit = await auditEditorialPr(pr);
  const ai = await scoreEditorial(audit.post, audit);
  const aiFailures = ai.available ? [] : ai.concerns.map((item) => `AI 품질 평가 실패: ${item}`);
  const failures = [...new Set([...audit.failures, ...aiFailures])];
  const sameCommit = previousState?.reviewedCommitSha === pr.head.sha;
  const previewUrl = sameCommit ? previousState?.previewUrl : previousState?.pendingPreviewUrl || null;
  const state = { ...(previousState || {}), title: audit.post?.title || pr.title, slug: audit.slug, score: ai.score, scoreBreakdown: ai.breakdown, scoreRationale: ai.rationale, strengths: ai.strengths, concerns: ai.concerns, failures, auditChecks: audit.checks, status: 'review', headSha: pr.head.sha, reviewedCommitSha: pr.head.sha, reviewedAt: new Date().toISOString(), previewUrl, pendingPreviewUrl: null };
  const updated = await github(`/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ body: withState(pr.body, state) }) });
  if (options.notify !== false) await sendEditorialReport(updated, state, state.test ? '🧪 테스트 초안 — 병합은 항상 차단됩니다.' : '');
  return state;
}

async function holdEditorialPr(number) {
  await addLabel(number, 'editorial:hold', { color: 'B60205', description: '편집장이 발행을 보류한 초안' });
  return setEditorialStatus(number, 'held');
}

async function recheckEditorialPr(number) {
  const pr = await github(`/pulls/${number}`);
  const labels = (pr.labels || []).map((label) => label.name);
  const state = stateFrom(pr.body);
  if (!state || pr.state !== 'open' || !labels.includes('editorial-review')) throw new Error('재검수할 editorial-review PR이 아닙니다.');
  await removeLabel(number, 'editorial:hold');
  Object.assign(state, { status: 'pending-review', score: 0, scoreBreakdown: {}, failures: ['수동 재검수 대기 중'], reviewedCommitSha: null, headSha: null, reviewedAt: null, updatedAt: new Date().toISOString() });
  const updated = await github(`/pulls/${number}`, { method: 'PATCH', body: JSON.stringify({ body: withState(pr.body, state) }) });
  return reviewEditorialPr(updated, { force: true, notify: true });
}

async function attachPreviewDeployment(commitSha, previewUrl) {
  if (!/^[a-f0-9]{40}$/i.test(commitSha || '') || !/^https:\/\//.test(previewUrl || '')) return null;
  const pulls = await github(`/commits/${commitSha}/pulls`);
  const pr = pulls.find((item) => item.state === 'open' && (item.labels || []).some((label) => label.name === 'editorial-review'));
  if (!pr) return null;
  const state = stateFrom(pr.body);
  if (!state || pr.head.sha !== commitSha) return null;
  if (state.reviewedCommitSha !== commitSha) {
    state.pendingPreviewUrl = previewUrl;
    const pending = await github(`/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ body: withState(pr.body, state) }) });
    return { pr: pending, state, pending: true };
  }
  state.previewUrl = previewUrl;
  state.previewReadyAt = new Date().toISOString();
  const updated = await github(`/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ body: withState(pr.body, state) }) });
  await sendEditorialReport(updated, state, '▲ Vercel Preview 배포가 완료되었습니다.');
  return { pr: updated, state };
}

async function publishEligibleDraft() {
  if (String(process.env.EDITORIAL_AUTOPUBLISH).toLowerCase() !== 'true') return { enabled: false, published: false };
  if (String(process.env.EDITORIAL_APPROVAL_ENABLED).toLowerCase() !== 'true') return { enabled: true, published: false, reason: 'EDITORIAL_APPROVAL_ENABLED=false라서 병합하지 않았습니다.' };
  const pulls = await github('/pulls?state=open&sort=created&direction=asc&per_page=50');
  const threshold = Number(process.env.AUTOPUBLISH_SCORE_THRESHOLD || 90);
  const candidate = pulls.find((pr) => {
    const state = stateFrom(pr.body);
    const labels = (pr.labels || []).map((label) => label.name);
    return labels.includes('editorial-review') && state && !state.test && state.status === 'review' && state.reviewedCommitSha === pr.head.sha && state.score >= threshold && Array.isArray(state.failures) && state.failures.length === 0;
  });
  if (!candidate) return { enabled: true, published: false, reason: '조건을 통과한 검토 PR이 없습니다.' };
  const result = await approveAndMerge(candidate.number);
  await sendEditorialNotice(`🕙 조건부 자동발행 완료\nPR #${candidate.number} · ${candidate.title}\n${candidate.html_url}`);
  return { enabled: true, published: true, number: candidate.number, url: candidate.html_url, result };
}

module.exports = { stateFrom, withState, createDraftPr, setEditorialStatus, approveAndMerge, reviseDraft, holdEditorialPr, recheckEditorialPr, reviewEditorialPr, attachPreviewDeployment, publishEligibleDraft };
