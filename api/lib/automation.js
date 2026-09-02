const requiredEnvironment = [
  'GITHUB_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'SITE_URL',
  'CRON_SECRET',
  'TELEGRAM_WEBHOOK_SECRET'
];

function configuredEnvironment() {
  return Object.fromEntries(requiredEnvironment.map((name) => [name, Boolean(process.env[name])]));
}

function isCronRequest(req) {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected) && req.headers.authorization === `Bearer ${expected}`;
}

function isTelegramRequest(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  return Boolean(expected) && req.headers['x-telegram-bot-api-secret-token'] === expected;
}

async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || 'Telegram request failed.');
  return result.result;
}

function splitTelegramText(text, limit = 4000) {
  const paragraphs = String(text || '').split(/\n\n+/);
  const parts = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= limit) {
      current = next;
      continue;
    }

    if (current) parts.push(current);
    current = '';
    for (let offset = 0; offset < paragraph.length; offset += limit) {
      const chunk = paragraph.slice(offset, offset + limit);
      if (chunk.length === limit) parts.push(chunk);
      else current = chunk;
    }
  }

  if (current) parts.push(current);
  return parts.length ? parts : [''];
}

async function reply(chatId, text) {
  const messages = [];
  for (const part of splitTelegramText(text)) {
    messages.push(await telegram('sendMessage', { chat_id: chatId, text: part, disable_web_page_preview: true }));
  }
  return messages;
}

function editorialDraftMessage({ title, score, analysis, body, previewUrl }) {
  const scoreLine = Number.isFinite(Number(score)) ? `편집 점수: ${score}/100` : '편집 점수: 검토 전';
  const analysisLine = analysis ? `\n\n[편집장 분석]\n${analysis}` : '';
  const previewLine = previewUrl ? `\n\n[미리보기]\n${previewUrl}` : '';
  return `[검토용 초안]\n${title}\n${scoreLine}${analysisLine}${previewLine}\n\n[글 전문]\n${body}`;
}

module.exports = { configuredEnvironment, isCronRequest, isTelegramRequest, telegram, reply, splitTelegramText, editorialDraftMessage };
