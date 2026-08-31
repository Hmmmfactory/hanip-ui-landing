const { telegram } = require('./automation');

function clip(value, length) {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

async function sendEditorialReport(pr, state, extra = '') {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return null;
  const rules = state.failures.length ? `차단 ${state.failures.length}건\n- ${state.failures.slice(0, 5).map((item) => clip(item, 180)).join('\n- ')}` : '필수 규칙 모두 통과';
  const breakdown = Object.values(state.scoreBreakdown || {}).map((item) => `${item.label} ${item.score}/${item.max}`).join(' · ');
  const rationale = state.scoreRationale ? `\n\nAI 감점 근거\n${clip(state.scoreRationale, 700)}` : '';
  const preview = state.previewUrl ? state.previewUrl : 'Vercel 배포 확인 중';
  const text = `📝 검토용 글 PR #${pr.number}\n${clip(state.title, 100)}\n\nAI 품질 점수: ${state.score}/100${breakdown ? `\n${breakdown}` : ''}\n${rules}\n검수 commit: ${state.reviewedCommitSha || '없음'}\nPR: ${pr.html_url}\nPreview: ${preview}${rationale}${extra ? `\n\n${clip(extra, 500)}` : ''}`;
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ 승인', callback_data: `approve:${pr.number}` }, { text: '✏️ 수정 요청', callback_data: `edit:${pr.number}` }],
        [{ text: '⏸ 보류', callback_data: `hold:${pr.number}` }, { text: '🔄 재검수', callback_data: `recheck:${pr.number}` }]
      ]
    }
  });
}

async function sendEditorialNotice(text) {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return null;
  return telegram('sendMessage', { chat_id: chatId, text: clip(text, 3500), disable_web_page_preview: true });
}

module.exports = { sendEditorialReport, sendEditorialNotice };
