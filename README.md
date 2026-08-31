# B01호

5평 반지하에서 실제로 써보고 살아남은 물건들을 기록하는 한국어 정적 사이트입니다. `index.html`을 브라우저에서 열면 바로 확인할 수 있습니다.

## 바꾸기 쉬운 항목

- 브랜드명과 문구: `index.html`
- 색상과 반응형 스타일: `style.css` 상단의 CSS 변수
- 문의 이메일: `index.html`의 `hello@b01room.kr`
- 메인 애니메이션: `index.html`의 `.room-stage` 가구 요소와 `style.css`의 `@keyframes arrive`

## 편집장 Telegram 연결 — 검토 PR → 승인 병합

비밀값은 GitHub나 코드에 저장하지 않습니다. Vercel의 **Production Environment Variables**에
`.env.example`의 값을 등록한 뒤 새 배포를 만듭니다. 저장소는 `GITHUB_OWNER=Hmmmfactory`, `GITHUB_REPO=hanip-ui-landing`처럼 나누어 등록하거나 `GITHUB_REPOSITORY=소유자/저장소` 하나로 등록할 수 있습니다. GitHub 토큰에는 **Contents / Pull requests / Issues: Read and write** 권한이 필요합니다. Issues 권한은 검토 PR에 `editorial-review` 라벨을 붙이는 데만 사용합니다.

1. `https://runday0829.vercel.app/api/automation-status`를 열어 `configured`가 모두 `true`인지 확인합니다.
2. 브라우저에서 `/automation-setup.html`을 열고 `CRON_SECRET`을 입력해 **Telegram 연결하기**를 누릅니다. 입력값은 저장되지 않습니다.

3. Telegram에서 봇을 열고 `/start`를 보냅니다. 봇이 보내는 숫자를 Vercel의 `TELEGRAM_ADMIN_CHAT_ID`에 등록하고 Redeploy합니다.
4. 다시 `/status`를 보내면 연결 확인 메시지가 옵니다. Vercel Cron은 매일 한국시간 07:30에 초안을 만들고, `editorial/...` 브랜치와 `editorial-review` 라벨이 붙은 검토용 PR을 생성합니다.

검토 PR에는 `story/<slug>.html`, `story/posts.json`, `sitemap.xml`, `feed.xml`, `llms.txt`가 함께 들어갑니다. 이 PR이 초안의 원본이며, main에 병합되기 전에는 Production 사이트에 발행되지 않습니다.

### GitHub PR 웹훅

GitHub 저장소의 **Settings → Webhooks → Add webhook**에서 다음 값으로 등록합니다.

- Payload URL: `https://runday0829.vercel.app/api/github/editorial`
- Content type: `application/json`
- Secret: Vercel의 `GITHUB_WEBHOOK_SECRET`과 같은 값
- Events: **Pull requests**, **Deployment statuses**

`GITHUB_WEBHOOK_SECRET`만 GitHub Webhook 설정과 Vercel 양쪽에 동일한 값으로 등록합니다. `GITHUB_TOKEN`, `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET` 등 나머지 토큰과 비밀값은 GitHub 설정이나 저장소 파일에 복사하지 않고 Vercel Environment Variables에만 보관합니다.

엔드포인트는 `opened`, `reopened`, `synchronize`, `labeled`, `ready_for_review` 이벤트 중 `editorial-review` 라벨이 붙고 base가 `main`인 열린 PR만 받습니다. 성공한 `deployment_status` 이벤트에서는 실제 Vercel Preview URL을 같은 commit의 검수 상태에 연결합니다. 다섯 발행 파일과 SEO 구조를 검사한 결과는 PR 본문의 숨김 상태에 기록되고 Telegram으로 전달됩니다. 동일 커밋의 중복 웹훅은 다시 보고하지 않습니다.

검수 코드는 역할별로 분리되어 있습니다.

- `api/lib/editorial-audit.js`: HTML·메타·JSON-LD·링크·발행 파일의 재현 가능한 규칙 검사
- `api/lib/editorial-score.js`: OpenAI 품질 점수와 감점 근거 생성
- `api/lib/editorial-report.js`: Telegram 검토 보고서와 버튼 생성
- `api/github/editorial.js`: GitHub Webhook 수신·서명 검증

Hard Gate는 AI 판단이 아니라 서버 코드가 검사합니다: 정적 HTML 존재, `posts.json` URL, title·description·canonical, BlogPosting·FAQPage·BreadcrumbList JSON-LD 파싱과 필수 속성, sitemap·RSS·llms.txt, 내부 링크 대상 파일, 작성자·날짜·FAQ 표시, 출처 없는 수치·효능 표현입니다. 한 항목이라도 실패하면 AI 점수와 관계없이 병합할 수 없습니다.

AI는 검색 의도 충족·글의 완성도·브랜드 고유성·AEO 구조를 각각 25점 범위에서 평가하고 근거를 반환합니다. AI가 총점을 작성하지 않으며, 서버가 각 점수를 0~25로 제한한 뒤 합산합니다. 검수 상태에는 `reviewedCommitSha`가 저장됩니다. PR의 현재 commit SHA가 이 값과 다르면 이전 승인은 무효이며 다시 검수하기 전까지 병합할 수 없습니다.

Telegram 보고서에는 `[✅ 승인] [✏️ 수정 요청] [⏸ 보류] [🔄 재검수]` 버튼이 붙습니다. 승인은 현재 commit을 최종 재검수한 뒤에만 병합하고, 수정 요청은 Force Reply로 PR 번호를 답장에 고정합니다. 보류는 `editorial:hold` 라벨을 붙이며, 재검수는 현재 commit을 다시 평가합니다. Telegram 수정이 쓸 수 있는 경로는 `story/`, `sitemap.xml`, `feed.xml`, `llms.txt`뿐입니다. PR에 API·설정 파일 변경이 하나라도 섞이면 Hard Gate가 병합을 차단합니다.

### 테스트와 예약 실행

- `POST /api/editorial/test`: 테스트 초안과 PR 생성. 테스트 PR은 점수와 관계없이 병합이 차단됩니다.
- `GET /api/cron/draft`: 매일 07:30 한국시간 초안 생성
- `GET /api/cron/publish`: 매일 10:00 한국시간 조건부 발행 판단

세 엔드포인트는 `Authorization: Bearer <CRON_SECRET>` 요청만 허용합니다. `EDITORIAL_AUTOPUBLISH=false`가 기본값이므로 10시 작업은 판단만 하고 병합하지 않습니다. 사람이 확인하지 않은 글도 자동 병합하려는 경우에만 값을 명시적으로 `true`로 바꿉니다.

### 첫 연결 테스트 — 발행 금지

처음에는 Vercel Production의 `EDITORIAL_APPROVAL_ENABLED=false`, `EDITORIAL_AUTOPUBLISH=false`를 유지하고 `/automation-setup.html`에서 **테스트 초안 보내기**를 실행합니다.

1. 테스트용 PR과 `editorial-review` 라벨 확인
2. Telegram에서 Hard Gate, AI 항목별 점수·감점, PR·Preview 확인
3. `✏️ 수정 요청` → 제목이나 도입부 수정 → 새 commit 점수 확인
4. `⏸ 보류` → `editorial:hold` 라벨 확인
5. 설정 페이지의 **마지막 테스트 상태 확인**에서 테스트 PR 미병합과 main 기준 SHA 확인

테스트 PR은 상태에 `test: true`가 기록되어 승인 버튼과 10시 자동발행 양쪽에서 항상 제외됩니다. 이 과정을 2~3회 통과한 뒤 `EDITORIAL_APPROVAL_ENABLED=true`로 바꾸어 일반 editorial PR의 수동 승인·병합을 먼저 시험합니다. 마지막 단계에서만 `EDITORIAL_AUTOPUBLISH=true`를 검토합니다. 자동발행에는 두 값이 모두 `true`여야 합니다.

Telegram 보고서의 **승인·병합**은 점수가 `AUTOPUBLISH_SCORE_THRESHOLD`(기본 90) 이상이고 필수 규칙 실패가 0개이며, 현재 PR 커밋이 웹훅 검수를 마친 경우에만 squash merge합니다. 검수 뒤 커밋이 바뀌면 승인은 차단되고 재검수를 기다립니다. 보류한 PR은 main에 병합되지 않습니다.
검토 중인 초안이 하나일 때는 Telegram에 자연어 수정 요청(예: `도입부를 두 문장으로 줄여줘`)을 보내면 같은 PR의 파일을 고치고 새 점수를 보고합니다.

웹훅은 Telegram이 보내는 비밀 헤더를 확인하며, 등록된 관리자 Chat ID 외의 메시지는 처리하지 않습니다.

## 대표님 공유용 설정 킷

터미널 없이 Chrome과 Codex로 편집장 자동발행을 설정하는 가이드는 `kit/editorial-automation/`에 있습니다. 배포 후 `/kit/editorial-automation/`에서 열고, 각 단계의 복사 프롬프트를 Codex에 붙여넣어 진행합니다.
