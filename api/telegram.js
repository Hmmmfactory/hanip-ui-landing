const { isTelegramRequest, reply, editorialDraftMessage } = require('./lib/automation');
const posts = require('../story/posts.json');

function latestStoryMessage() {
  const latest = posts[0];
  if (!latest) return '아직 확인할 글이 없습니다.';
  const siteUrl = (process.env.SITE_URL || 'https://runday0829.vercel.app').replace(/\/$/, '');
  const previewUrl = latest.url ? `${siteUrl}/story/${latest.url}` : `${siteUrl}/story/`;
  return editorialDraftMessage({
    title: latest.title,
    body: latest.body,
    previewUrl
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isTelegramRequest(req)) return res.status(401).end();

  const message = req.body && req.body.message;
  if (!message || !message.chat || typeof message.text !== 'string') return res.status(200).json({ ok: true });

  const chatId = String(message.chat.id);
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) {
    if (message.text.trim() === '/start') {
      await reply(chatId, `B01호 편집장 연결 준비 완료.\n\n관리자 Chat ID: ${chatId}\n\n이 숫자를 Vercel의 TELEGRAM_ADMIN_CHAT_ID 환경변수에 등록한 뒤 Redeploy해 주세요.`);
    }
    return res.status(200).json({ ok: true });
  }

  if (chatId !== String(adminChatId)) return res.status(200).json({ ok: true });

  const command = message.text.trim().toLowerCase();
  if (command === '/latest' || command === '/draft' || command === '최신글') {
    await reply(chatId, latestStoryMessage());
  } else if (command === '/start' || command === '/status') {
    await reply(chatId, 'B01호 편집장이 연결되었습니다.\n\n/latest 또는 /draft: 최신 글 전문과 미리보기 링크\n\n자동 초안 알림은 점수·분석·글 전문·미리보기 링크를 한 묶음으로 보내도록 연결할 수 있습니다.');
  }

  return res.status(200).json({ ok: true });
};
