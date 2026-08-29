---
name: runday-seo
description: 실행DAY 브랜드 사이트(정적 HTML + story/posts.json 블로그)의 SEO·AEO·GEO 기준. 블로그 글을 쓰거나 발행할 때, 정적 글 페이지를 만들 때, sitemap·feed·llms.txt 를 갱신할 때, 사이트를 점검(audit)할 때 사용한다. "블로그 글 써줘", "발행", "SEO 점검", "AI 검색에 잘 보이게", "구조화 데이터", "sitemap" 요청이면 이 스킬을 따른다.
---

# runday-seo — 검색엔진과 AI 답변 엔진에 동시에 읽히는 블로그

이 사이트는 프레임워크 없는 **정적 HTML** 이고, 블로그는 `story/` 폴더에 있다.
- `story/posts.json` — 글 목록 데이터(홈 카드·목록 페이지가 읽음)
- `story/index.html` — 목록, `story/post.html` — 동적 상세(브라우저에서 posts.json 을 그려 보여줌)
- `story/admin.html` — 관리 페이지(검색 제외 대상)

## 핵심 원칙 3가지

1. **글은 반드시 정적 HTML 로도 존재해야 한다.** `post.html?id=` 는 브라우저 JS 로 그리기 때문에 ChatGPT·Perplexity·Claude 의 크롤러(JS 미실행)에는 빈 페이지다. 글마다 `story/<slug>.html` 을 만들고 본문·메타·JSON-LD 를 HTML 에 직접 쓴다. `posts.json` 의 해당 글에는 `"url": "<slug>.html"` 을 넣는다(목록·홈 카드가 자동으로 정적 페이지로 연결됨).
2. **화면에 없는 사실은 어디에도 넣지 않는다.** 통계·후기·별점·재고·효능·인증·"국내 1위" 같은 표현을 만들어내지 않는다. 근거가 필요한 주장은 출처를 달고, 출처를 못 찾으면 주장을 뺀다. 구조화 데이터에는 페이지에 실제로 보이는 값만 넣는다.
3. **첫 문단이 답이다.** 제목의 질문에 첫 2~3문장으로 직접 답한다. AI 는 그 문단을 그대로 인용한다.

## 글 한 편의 규격 (작성·발행 시 전부 지킨다)

| 항목 | 규칙 |
|---|---|
| slug | 영문 소문자·하이픈, 날짜 없이 주제만 (`white-cast`, `sunscreen-reapply`) |
| title | 고객이 검색창에 치는 **질문형**, 60자 이내, 브랜드명은 뒤에 또는 생략 |
| description | 80~150자, 답의 요지 + 누구에게 유용한지. 요약(summary)과 달라도 됨 |
| 도입 | 첫 문단 2~3문장으로 직접 답. "오늘은 ~에 대해 알아보겠습니다" 류 금지 |
| 본문 | H2 는 질문 또는 명사구, 3~5개. 문단은 3~4문장. 40~80자짜리 **혼자 떼어내도 뜻이 통하는 문장**을 H2 마다 하나씩 |
| 표·목록 | 비교·순서·기준이 나오면 표 또는 목록으로 (AI 인용률이 높은 형식) |
| 경험 | 이 브랜드만 아는 사실 1개 이상 (만드는 과정, 실패, 고객이 실제 물은 것). 일반론만 있는 글은 발행하지 않는다 |
| FAQ | 글 끝에 3개, `faq: [{q, a}]`. 답은 1~2문장, 본문과 중복 금지 |
| 내부 링크 | 관련 글 1~2개 + 제품 페이지 1개(자연스러울 때만) |
| CTA | 마지막에 1개. 브랜드의 실제 전환 목표(스토어·상담·구독)와 연결 |
| 출처 | `sources: [{title, url}]`. 외부 사실을 쓴 글은 1개 이상 |
| 작성자·날짜 | `author`, `date`(발행), `updated`(수정 시) |

`posts.json` 항목 필드: `id, title, date, summary, tags, body` (필수) + `url, description, author, updated, faq, sources` (선택). `body` 규칙은 빈 줄=문단 / `## `=소제목 / `- `=목록 세 가지뿐.

## 정적 글 페이지 `story/<slug>.html` 만드는 법

`story/post.html`(헤더·푸터가 이미 통합된 것)을 복제한 뒤:
1. `<main id="main">` 안에 본문을 **HTML 로 직접** 쓴다(`<article>` → `<header>`(time·h1·작성자) → 본문 `<h2>/<p>/<ul>` → FAQ `<section class="faq">` 의 `<details><summary>` → 출처 `<section class="sources">` → 이전/다음 글 링크). posts.json 을 fetch 하는 `<script>` 는 지운다.
2. `<head>` 를 채운다 — 모두 실제 값으로:
```html
<title>{title}</title>
<meta name="description" content="{description}">
<meta name="author" content="{author}">
<link rel="canonical" href="https://{도메인}/story/{slug}.html">
<meta property="og:type" content="article">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="https://{도메인}/story/{slug}.html">
<meta property="og:image" content="https://{도메인}/{대표 이미지 — 있을 때만}">
<script type="application/ld+json">{BlogPosting: headline, description, datePublished, dateModified, author{Person}, mainEntityOfPage, keywords}</script>
<script type="application/ld+json">{FAQPage: mainEntity[Question{name, acceptedAnswer{Answer{text}}}]}</script>
<script type="application/ld+json">{BreadcrumbList: 홈 → 이야기 → 이 글}</script>
```
3. `posts.json` 에 같은 글을 추가(또는 갱신)하고 `"url": "{slug}.html"` 을 넣는다.
4. 상대 경로(`../assets/…`, `index.html`)가 story/ 기준으로 맞는지 확인한다.

## 발행할 때마다 함께 갱신하는 파일 (빠지면 발행 실패로 본다)

- `sitemap.xml` — 새 글 URL 추가, `<lastmod>` 는 `updated ?? date`. `story/admin.html`, `post.html?id=` 은 넣지 않는다
- `feed.xml` — RSS 2.0, 최신 20개 (없으면 만든다: title·link·description·pubDate·guid)
- `llms.txt` — "## 이야기(블로그)" 절에 `- [제목](절대 URL): 한 줄 요약` 을 최신순으로 유지(최대 30개)
- `story/admin.html` — `<meta name="robots" content="noindex,nofollow">` 유지, `robots.txt` 에 `Disallow: /story/admin.html`

## 점검(audit) 체크리스트 — 결과를 표로 보고한다

실행DAY 채점 기준 5번(AEO·발견성)과 같은 항목이다. 각 줄을 **통과/실패/해당없음** 으로 판정하고, 실패는 고친 뒤 다시 판정한다.

1. 모든 페이지 `<title>` 이 서로 다르고 60자 이내, `<meta name="description">` 이 비어 있지 않다
2. 모든 페이지에 `canonical` 이 실제 배포 주소(https, 도메인 일치)로 있다
3. `og:title / og:description / og:url` 이 있고, og:image 가 있으면 절대 URL 이다
4. `<h1>` 은 페이지당 1개, H2 이하 순서가 건너뛰지 않는다
5. 이미지 `alt` 누락 0 (장식 이미지는 `alt=""`)
6. JSON-LD: 홈에 `Organization`+`WebSite`, 제품에 `Product`(가격·이름은 화면 값), 글에 `BlogPosting`+`FAQPage`(FAQ 있을 때)+`BreadcrumbList`. `JSON.parse` 가 통과하고, 화면에 없는 속성(별점·리뷰 수·재고)이 없다
7. `sitemap.xml` 이 유효하고 모든 공개 페이지·글을 포함하며 admin·`?id=` URL 이 없다
8. `robots.txt` 가 sitemap 위치를 가리키고 admin 만 막는다 (AI 크롤러 GPTBot·ClaudeBot·PerplexityBot 을 막지 않는다)
9. `llms.txt` 가 있고: 브랜드 한 줄 → 파는 것 → 페이지 안내 → 블로그 글 목록 순, 링크는 절대 URL
10. 내부 링크 깨짐 0 (파일 존재 여부로 확인), 외부 링크는 `rel="noopener"`
11. 글마다 작성자·발행일이 보이고, 정적 `story/<slug>.html` 이 존재하며 posts.json 의 `url` 과 일치한다
12. 허위·미검증 표현 0: "국내 1위", "최고", 출처 없는 수치·효능, 지어낸 후기
13. 모바일 375px 에서 가로 스크롤 없음, `viewport` 메타 존재

점검 명령 예: `node -e` 로 HTML 을 읽어 정규식으로 title/description/canonical 추출, `find story -name "*.html"` 과 posts.json 의 url 대조, JSON-LD 는 `JSON.parse`. 외부 도구 없이 저장소 안에서 끝낸다.

## 보고 형식

1. 발행/수정한 글 (제목·slug·URL)
2. 갱신한 파일 (posts.json·sitemap·feed·llms.txt)
3. 점검표 13줄 판정 + 고친 것
4. 사람이 직접 확인할 것 (사실 검증 필요 문장, 대표 이미지, 서치콘솔 색인 요청)
5. 다음에 고칠 우선순위 3개

## 출처
marketingskills(coreyhaines31, MIT)의 ai-seo·schema·seo-audit 스킬에서 정적 사이트에 맞는 규칙만 추려 한국어로 재구성했다. 원본: https://github.com/coreyhaines31/marketingskills
