# B01호

5평 반지하에서 실제로 써보고 살아남은 물건들을 기록하는 한국어 정적 사이트입니다. `index.html`을 브라우저에서 열면 바로 확인할 수 있습니다.

## 바꾸기 쉬운 항목

- 브랜드명과 문구: `index.html`
- 색상과 반응형 스타일: `style.css` 상단의 CSS 변수
- 문의 이메일: `index.html`의 `hello@b01room.kr`
- 메인 애니메이션: `index.html`의 `.room-stage` 가구 요소와 `style.css`의 `@keyframes arrive`

## 편집장 Telegram 연결 — 1차 연결 테스트

비밀값은 GitHub나 코드에 저장하지 않습니다. Vercel의 **Production Environment Variables**에
`.env.example`의 값을 등록한 뒤 새 배포를 만듭니다.

1. `https://runday0829.vercel.app/api/automation-status`를 열어 `configured`가 모두 `true`인지 확인합니다.
2. 로컬 터미널에서 아래 명령으로 Telegram 웹훅을 등록합니다. `CRON_SECRET` 값은 터미널에서만 입력하고 공유하지 마세요.

   ```sh
   curl -X POST https://runday0829.vercel.app/api/telegram/setup \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

3. Telegram에서 봇을 열고 `/start`를 보냅니다. 봇이 보내는 숫자를 Vercel의 `TELEGRAM_ADMIN_CHAT_ID`에 등록하고 Redeploy합니다.
4. 다시 `/status`를 보내면 연결 확인 메시지가 옵니다.

웹훅은 Telegram이 보내는 비밀 헤더를 확인하며, 등록된 관리자 Chat ID 외의 메시지는 처리하지 않습니다.
