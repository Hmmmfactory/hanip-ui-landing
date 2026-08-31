const requiredEnvironment = [
  'GITHUB_TOKEN',
  'GITHUB_WEBHOOK_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'SITE_URL',
  'CRON_SECRET',
  'TELEGRAM_WEBHOOK_SECRET'
];

function configuredEnvironment() {
  return {
    ...Object.fromEntries(requiredEnvironment.map((name) => [name, Boolean(process.env[name])])),
    GITHUB_REPOSITORY: Boolean(process.env.GITHUB_REPOSITORY || (process.env.GITHUB_OWNER && process.env.GITHUB_REPO))
  };
}

function isCronRequest(req) {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected) && req.headers.authorization === `Bearer ${expected}`;
}

function isTelegramRequest(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  return Boolean(expected) && req.headers['x-telegram-bot-api-secret-token'] === expected;
}

function verifyGitHubSignature(rawBody, signature) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !rawBody || typeof signature !== 'string') return false;
  const crypto = require('crypto');
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
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

async function reply(chatId, text) {
  return telegram('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
}

module.exports = { configuredEnvironment, isCronRequest, isTelegramRequest, verifyGitHubSignature, telegram, reply };
