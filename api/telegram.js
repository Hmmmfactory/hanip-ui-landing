const { isTelegramRequest, reply, editorialDraftMessage } = require('./lib/automation');
const posts = require('../story/posts.json');

function latestStoryMessage() {
  const latest = posts[0];
  if (!latest) return '아직 확인할 글이 없습니다.';
  const siteUrl = (process.env.SITE_URL || 'https://runday0829.vercel.app').replace(/\/$/, '');
  const previewUrl = latest.url ? `${siteUrl}/story/${latest.url}` : `${siteUrl}/story/`;
  return `[최근 등록 글]\n${latest.title}\n\n[글 요약]\n${latest.summary || latest.description || String(latest.body || '').slice(0,500)}\n\n[글 링크]\n${previewUrl}\n\n이 응답은 등록 목록 기준이며, 로컬 편집실의 검토·예약 상태와 연동되지 않습니다.`;
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
  if (command === '/latest' || command === '최신글') {
    await reply(chatId, latestStoryMessage());
  } else if (command === '/draft') {
    await reply(chatId, '로컬 편집실 초안은 이 봇과 동기화되지 않습니다. 편집실의 주간 발행 계획에서 검토해주세요. /latest는 최근 등록 글을 보여줍니다.');
  } else if (command === '/start' || command === '/status') {
    await reply(chatId, 'B01호 편집장이 연결되었습니다.\n\n/latest: 최근 등록 글 요약과 링크\n/draft: 로컬 초안 확인 안내\n\n이 원격 봇에는 예약 자동발행 기능이 없습니다. 예약과 발행 완료 알림은 로컬 편집실에서 설정하고 확인하세요.');
  }

  return res.status(200).json({ ok: true });
};
