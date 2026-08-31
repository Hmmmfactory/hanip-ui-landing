const { github, file } = require('./github');
const posix = require('path').posix;

function addCheck(checks, name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
}

function isEditorialPath(path) {
  return String(path).startsWith('story/') || ['sitemap.xml', 'feed.xml', 'llms.txt'].includes(String(path));
}

function jsonLdTypes(html) {
  const types = new Set();
  const errors = [];
  const nodesFound = [];
  const scripts = String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const value = JSON.parse(match[1]);
      const nodes = Array.isArray(value) ? value : value['@graph'] || [value];
      for (const node of nodes) if (node && node['@type']) { types.add(node['@type']); nodesFound.push(node); }
    } catch (error) { errors.push(error.message); }
  }
  return { types, errors, nodes: nodesFound };
}

function hasMeta(html, key, value) {
  return (String(html).match(/<meta\b[^>]*>/gi) || []).some((tag) => {
    const keyMatch = new RegExp(`\\b${key}=["']${value}["']`, 'i').test(tag);
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    return keyMatch && Boolean(content && content.trim());
  });
}

function unsupportedClaims(post) {
  const text = `${post?.title || ''}\n${post?.body || ''}`;
  const fragments = text.split(/[.!?。\n]+/).map((item) => item.trim()).filter(Boolean);
  const claimPattern = /\d+(?:[.,]\d+)?\s*(?:%|퍼센트|cm|mm|m|평|개|회|일|시간|분|원|배)|(?:효과|효능|개선|감소|증가|제거|예방|완화)(?:되|하|시|할|된|됩니다|합니다|했다|한다)/i;
  return fragments.filter((fragment) => claimPattern.test(fragment)).slice(0, 5);
}

function internalTargets(html, currentPath) {
  const targets = new Map();
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1].trim();
    if (!href || /^(?:https?:|mailto:|tel:|javascript:|#|\/\/)/i.test(href)) continue;
    if (/post\.html\?id=/i.test(href)) {
      targets.set(href, null);
      continue;
    }
    let clean = href.split('#')[0].split('?')[0];
    try { clean = decodeURIComponent(clean); } catch (_) {}
    if (!clean) continue;
    let target = clean.startsWith('/') ? clean.slice(1) : posix.join(posix.dirname(currentPath), clean);
    target = posix.normalize(target);
    if (target === '.' || target === '') target = 'index.html';
    if (target.endsWith('/')) target += 'index.html';
    if (!posix.extname(target)) target = `${target}/index.html`;
    targets.set(href, target);
  }
  return targets;
}

async function brokenInternalLinks(html, currentPath, ref) {
  const broken = [];
  for (const [href, target] of internalTargets(html, currentPath)) {
    if (!target || target.startsWith('../')) {
      broken.push(href);
      continue;
    }
    try { await file(target, ref); }
    catch (_) { broken.push(href); }
  }
  return broken;
}

function auditPost(post) {
  const checks = [];
  addCheck(checks, '질문형 제목', post?.title && post.title.length <= 60 && /\?$/.test(post.title), '제목은 질문형이며 60자 이하여야 합니다');
  addCheck(checks, 'description 길이', post?.description && post.description.length >= 80 && post.description.length <= 150, 'description은 80~150자여야 합니다');
  addCheck(checks, '본문 길이', post?.body && post.body.replace(/\s/g, '').length >= 1000, 'FAQ·출처 제외 본문은 최소 1,000자여야 합니다');
  const h2Count = (post?.body?.match(/^## /gm) || []).length;
  addCheck(checks, 'H2 구성', h2Count >= 3 && h2Count <= 5, `H2는 3~5개여야 합니다(현재 ${h2Count}개)`);
  const intro = String(post?.body || '').split(/\n\s*\n/)[0];
  addCheck(checks, '답부터 시작하는 도입', intro.length >= 40 && !/오늘은|알아보겠습니다|살펴보겠습니다/.test(intro), '첫 문단은 상투적 예고 없이 질문에 바로 답해야 합니다');
  addCheck(checks, 'FAQ 3개', Array.isArray(post?.faq) && post.faq.length === 3 && post.faq.every((item) => item.q && item.a), '질문과 답이 있는 FAQ가 정확히 3개여야 합니다');
  addCheck(checks, '출처 형식', !post?.sources?.length || (Array.isArray(post.sources) && post.sources.every((item) => item.title && /^https:\/\//.test(item.url))), '출처가 있으면 제목과 HTTPS URL이 필요합니다');
  addCheck(checks, '작성자·날짜', Boolean(post?.author && /^\d{4}-\d{2}-\d{2}$/.test(post?.date || '')), '작성자와 YYYY-MM-DD 발행일이 필요합니다');
  addCheck(checks, '미검증 과장 표현', !/(국내\s*1위|무조건|100%|효과를?\s*보장|최고의\s*제품)/.test(`${post?.title || ''}\n${post?.body || ''}`), '과장·보장 표현은 발행할 수 없습니다');
  const claims = unsupportedClaims(post);
  const hasSources = Array.isArray(post?.sources) && post.sources.length > 0;
  addCheck(checks, '수치·효능 출처', claims.length === 0 || hasSources, claims.length ? `출처 확인이 필요한 표현: ${claims.join(' / ')}` : '수치·효능 주장은 출처가 필요합니다');
  return checks;
}

async function auditEditorialPr(pr) {
  const changed = await github(`/pulls/${pr.number}/files?per_page=100`);
  const paths = changed.map((item) => item.filename);
  const stateMatch = String(pr.body || '').match(/<!-- editorial-state:([A-Za-z0-9+/=]+) -->/);
  let savedState = null;
  try { if (stateMatch) savedState = JSON.parse(Buffer.from(stateMatch[1], 'base64').toString('utf8')); } catch (_) {}
  const storyPages = paths.filter((path) => /^story\/[a-z0-9-]+\.html$/.test(path));
  const slug = savedState?.slug || (storyPages[0] && storyPages[0].slice(6, -5));
  const checks = [];
  const required = slug ? [`story/${slug}.html`, 'story/posts.json', 'sitemap.xml', 'feed.xml', 'llms.txt'] : [];
  addCheck(checks, 'slug', Boolean(slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)), '영문 소문자와 하이픈으로 된 slug가 필요합니다');
  const forbiddenPaths = paths.filter((path) => !isEditorialPath(path));
  addCheck(checks, '허용된 변경 경로', forbiddenPaths.length === 0, forbiddenPaths.length ? `변경 금지 파일: ${forbiddenPaths.join(', ')}` : 'story/, sitemap.xml, feed.xml, llms.txt만 수정할 수 있습니다');
  addCheck(checks, '검토 파일 5개', required.length === 5 && required.every((path) => paths.includes(path)), `필수 변경 파일: ${required.join(', ')}`);

  let post = null;
  try {
    const posts = JSON.parse((await file('story/posts.json', pr.head.sha)).text);
    post = posts.find((item) => item.id === slug || item.url === `${slug}.html`) || null;
    addCheck(checks, 'posts.json 연결', Boolean(post && post.url === `${slug}.html`), 'posts.json 항목과 정적 글 URL이 일치해야 합니다');
  } catch (error) { addCheck(checks, 'posts.json 파싱', false, error.message); }
  if (post) checks.push(...auditPost(post));

  if (slug) {
    const site = String(process.env.SITE_URL || '').replace(/\/$/, '');
    const url = `${site}/story/${slug}.html`;
    try {
      const [page, sitemap, feed, llms] = await Promise.all([
        file(`story/${slug}.html`, pr.head.sha), file('sitemap.xml', pr.head.sha), file('feed.xml', pr.head.sha), file('llms.txt', pr.head.sha)
      ]);
      const html = page.text;
      addCheck(checks, '정적 HTML 존재', Boolean(html && /<article\b/i.test(html)), `story/${slug}.html에 본문 article이 있어야 합니다`);
      addCheck(checks, 'HTML title', /<title>\s*[^<]+\s*<\/title>/i.test(html), '비어 있지 않은 title이 필요합니다');
      addCheck(checks, 'HTML description', hasMeta(html, 'name', 'description'), '비어 있지 않은 meta description이 필요합니다');
      addCheck(checks, 'canonical', html.includes(`<link rel="canonical" href="${url}">`), '정적 글 canonical이 실제 글 URL과 일치해야 합니다');
      addCheck(checks, 'Open Graph', ['og:title', 'og:description', 'og:url'].every((name) => hasMeta(html, 'property', name)), 'og:title, og:description, og:url이 필요합니다');
      addCheck(checks, '제목 구조', (html.match(/<h1\b/gi) || []).length === 1 && (html.match(/<h2\b/gi) || []).length >= 3, 'H1은 하나이고 H2가 이어져야 합니다');
      addCheck(checks, '작성자·날짜 표시', Boolean(post?.author && post?.date && html.includes(post.author) && html.includes(post.date)), '정적 글 화면에 작성자와 발행일이 보여야 합니다');
      addCheck(checks, 'FAQ 표시', !post?.faq?.length || (html.match(/<details\b/gi) || []).length === post.faq.length, 'posts.json의 FAQ가 정적 글 화면에도 모두 있어야 합니다');
      addCheck(checks, '모바일 viewport', /<meta[^>]+name=["']viewport["']/i.test(html), 'viewport 메타가 필요합니다');
      const imageTags = html.match(/<img\b[^>]*>/gi) || [];
      addCheck(checks, '이미지 alt', imageTags.every((tag) => /\balt=["'][^"']*["']/i.test(tag)), '모든 이미지에 alt 속성이 필요합니다');
      const structured = jsonLdTypes(html);
      addCheck(checks, 'JSON-LD 파싱', structured.errors.length === 0, structured.errors.join('; ') || 'JSON-LD가 유효해야 합니다');
      const blogPosting = structured.nodes.find((node) => node['@type'] === 'BlogPosting');
      const faqPage = structured.nodes.find((node) => node['@type'] === 'FAQPage');
      const breadcrumb = structured.nodes.find((node) => node['@type'] === 'BreadcrumbList');
      addCheck(checks, 'BlogPosting 구조화 데이터', Boolean(blogPosting?.headline && blogPosting?.description && blogPosting?.datePublished && blogPosting?.author && blogPosting?.mainEntityOfPage), 'BlogPosting 필수 속성이 필요합니다');
      const faqValid = !post?.faq?.length || (Array.isArray(faqPage?.mainEntity) && faqPage.mainEntity.length === post.faq.length && faqPage.mainEntity.every((item) => item.name && item.acceptedAnswer?.text));
      addCheck(checks, 'FAQPage 구조화 데이터', faqValid, 'FAQ 질문·답과 일치하는 FAQPage JSON-LD가 필요합니다');
      addCheck(checks, 'BreadcrumbList 구조화 데이터', Array.isArray(breadcrumb?.itemListElement) && breadcrumb.itemListElement.length >= 3, '홈→이야기→글 BreadcrumbList가 필요합니다');
      const externalLinks = [...html.matchAll(/<a\b([^>]*href=["']https?:\/\/[^"']+["'][^>]*)>/gi)].map((match) => match[1]);
      addCheck(checks, '외부 링크 보안', externalLinks.every((attrs) => /rel=["'][^"']*noopener[^"']*["']/i.test(attrs)), '외부 링크에는 rel="noopener"가 필요합니다');
      const brokenLinks = await brokenInternalLinks(html, `story/${slug}.html`, pr.head.sha);
      addCheck(checks, '내부 링크', brokenLinks.length === 0, brokenLinks.length ? `깨진 링크: ${brokenLinks.join(', ')}` : '모든 내부 링크 대상 파일이 존재해야 합니다');
      addCheck(checks, 'sitemap 반영', sitemap.text.includes(`<loc>${url}</loc>`) && !sitemap.text.includes('post.html?id='), 'sitemap에 정적 URL만 포함해야 합니다');
      addCheck(checks, 'RSS 반영', feed.text.includes(`<guid isPermaLink="true">${url}</guid>`), 'feed.xml에 글 URL이 필요합니다');
      addCheck(checks, 'llms.txt 반영', llms.text.includes(`](${url}):`), 'llms.txt 이야기 절에 글 URL이 필요합니다');
    } catch (error) { addCheck(checks, '발행 파일 읽기', false, error.message); }
  }

  const failures = checks.filter((item) => !item.passed).map((item) => `${item.name}: ${item.detail}`);
  return { slug, post, paths, checks, failures };
}

module.exports = { isEditorialPath, auditPost, auditEditorialPr, jsonLdTypes, hasMeta, unsupportedClaims, internalTargets, brokenInternalLinks };
