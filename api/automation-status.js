const { configuredEnvironment } = require('../server/automation');

module.exports = (req, res) => {
  const configured = configuredEnvironment();
  const ready = Object.values(configured).every(Boolean) && Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID);

  res.status(200).json({
    ready,
    configured,
    telegramAdminRegistered: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
    schedule: {
      draftDelivery: '매일 07:30 Asia/Seoul',
      conditionalPublish: '매일 10:00 Asia/Seoul',
      minimumEditorialScore: Number(process.env.AUTOPUBLISH_SCORE_THRESHOLD || 90),
      manualApprovalEnabled: String(process.env.EDITORIAL_APPROVAL_ENABLED).toLowerCase() === 'true',
      conditionalPublishEnabled: String(process.env.EDITORIAL_AUTOPUBLISH).toLowerCase() === 'true'
    },
    endpoints: {
      githubWebhook: '/api/github/editorial',
      testDraft: '/api/editorial/test',
      scheduledDraft: '/api/cron/draft',
      conditionalPublish: '/api/cron/publish'
    }
  });
};
