const { isTelegramRequest, reply, telegram } = require('../server/automation');
const { approveAndMerge, reviseDraft, holdEditorialPr, recheckEditorialPr } = require('../server/editorial');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isTelegramRequest(req)) return res.status(401).end();

  const callback = req.body && req.body.callback_query;
  if (callback && callback.message && callback.data) {
    const chatId = String(callback.message.chat.id);
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (chatId !== String(adminChatId)) return res.status(200).json({ ok: true });
    try {
      const [action, number] = callback.data.split(':');
      if (!/^\d+$/.test(number)) throw new Error('Invalid PR number.');
      if (action === 'hold') {
        await holdEditorialPr(number);
        await reply(chatId, `⏸ PR #${number}를 보류하고 editorial:hold 라벨을 붙였습니다.`);
      } else if (action === 'approve') {
        const result = await approveAndMerge(number);
        await reply(chatId, `✅ PR #${number}를 승인하고 main에 병합했습니다. Vercel Production 배포가 시작됩니다.\n${result.pr.html_url}`);
      } else if (action === 'edit') {
        await telegram('sendMessage', {
          chat_id: chatId,
          text: `✏️ PR #${number} 수정 내용을 이 메시지에 답장해주세요.`,
          reply_markup: { force_reply: true, selective: true },
          reply_to_message_id: callback.message.message_id
        });
      } else if (action === 'recheck') {
        await recheckEditorialPr(number);
        await reply(chatId, `🔄 PR #${number}의 현재 commit을 다시 검수했습니다.`);
      } else throw new Error('Unknown editorial action.');
    } catch (error) { await reply(chatId, `⚠️ 요청을 처리하지 못했습니다: ${error.message}`); }
    await telegram('answerCallbackQuery', { callback_query_id: callback.id });
    return res.status(200).json({ ok: true });
  }

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

  if (message.text.trim() === '/start' || message.text.trim() === '/status') {
    await reply(chatId, 'B01호 편집장이 연결되었습니다.\n\n매일 07:30 한국시간에 검토용 PR을 만듭니다.\nTelegram 버튼으로 보류하거나, 규칙을 통과한 PR만 승인·병합할 수 있습니다.\n\n검토 중인 초안에는 자연어로 수정 요청을 보내세요.');
  }
  else if (!message.text.trim().startsWith('/')) {
    const repliedPrompt = message.reply_to_message;
    const editMatch = repliedPrompt?.from?.is_bot && String(repliedPrompt.text || '').match(/PR #(\d+) 수정 내용을/);
    if (!editMatch) {
      await reply(chatId, '수정할 PR의 검토 메시지에서 ✏️ 수정 요청 버튼을 누른 뒤, 봇의 질문에 답장해주세요.');
      return res.status(200).json({ ok: true });
    }
    try {
      const pr = await reviseDraft(editMatch[1], message.text.trim());
      await reply(chatId, `✍️ 수정 요청을 PR #${pr.number}에 반영했습니다. 새 commit의 검수와 Vercel Preview를 기다립니다.`);
    } catch (error) { await reply(chatId, `⚠️ 수정 요청을 처리하지 못했습니다: ${error.message}`); }
  }

  return res.status(200).json({ ok: true });
};
