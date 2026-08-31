const { isTelegramRequest, reply } = require('./lib/automation');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isTelegramRequest(req)) return res.status(401).end();

  // Telegram retries failed webhooks. Return 200 promptly, then handle only text messages.
  res.status(200).json({ ok: true });

  const message = req.body && req.body.message;
  if (!message || !message.chat || typeof message.text !== 'string') return;

  const chatId = String(message.chat.id);
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) {
    if (message.text.trim() === '/start') {
      await reply(chatId, `B01호 편집장 연결 준비 완료.\n\n관리자 Chat ID: ${chatId}\n\n이 숫자를 Vercel의 TELEGRAM_ADMIN_CHAT_ID 환경변수에 등록한 뒤 Redeploy해 주세요.`);
    }
    return;
  }

  if (chatId !== String(adminChatId)) return;

  if (message.text.trim() === '/start' || message.text.trim() === '/status') {
    await reply(chatId, 'B01호 편집장이 연결되었습니다.\n\n매일 07:30 초안 검토 알림\n매일 10:00 · 90점 이상인 미확인 초안만 조건부 자동발행\n\n채팅 수정·발행 기능은 다음 배포에서 연결됩니다.');
  }
};
