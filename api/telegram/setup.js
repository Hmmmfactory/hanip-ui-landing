const { isCronRequest, telegram } = require('../../server/automation');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!isCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
    if (!siteUrl.startsWith('https://')) throw new Error('SITE_URL must begin with https://');

    const result = await telegram('setWebhook', {
      url: `${siteUrl}/api/telegram`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    });
    res.status(200).json({ ok: true, message: result, webhook: `${siteUrl}/api/telegram` });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
