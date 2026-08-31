const { isCronRequest } = require('../lib/automation');
const { publishEligibleDraft } = require('../lib/editorial');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST only' });
  if (!isCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await publishEligibleDraft();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) { return res.status(500).json({ ok: false, error: error.message }); }
};
