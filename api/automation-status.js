const { configuredEnvironment } = require('./lib/automation');
module.exports = (req, res) => {
  const configured = configuredEnvironment();
  res.status(200).json({
    ready: false, credentialsConfigured: Object.values(configured).every(Boolean) && Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID), configured,
    telegramAdminRegistered: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
    capabilities: { latestPublishedStory: true, localDraftSync: false, scheduledDraftDelivery: false, scheduledPublication: false },
    schedule: { enabled: false },
    message: '이 원격 연결은 최신 등록 글 조회용입니다. 로컬 편집실의 검토·예약·전달 상태와 동기화되지 않습니다.'
  });
};
