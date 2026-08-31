const { isCronRequest } = require('../lib/automation');
const { createDraftPr } = require('../lib/editorial');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST only' });
  if (!isCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const pr = await createDraftPr(req.body && req.body.topic);
    return res.status(201).json({ ok: true, pr: pr.html_url, number: pr.number });
  } catch (error) { return res.status(500).json({ ok: false, error: error.message }); }
};
