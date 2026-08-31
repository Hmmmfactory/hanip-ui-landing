const { verifyGitHubSignature } = require('../lib/automation');
const { reviewEditorialPr, attachPreviewDeployment } = require('../lib/editorial');
const { repo } = require('../lib/github');

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const rawBody = await readRawBody(req);
  if (!verifyGitHubSignature(rawBody, req.headers['x-hub-signature-256'])) return res.status(401).json({ error: 'Invalid GitHub signature' });

  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch (_) { return res.status(400).json({ error: 'Invalid JSON payload' }); }

  if (req.headers['x-github-event'] === 'ping') return res.status(200).json({ ok: true, event: 'ping' });
  if (String(payload.repository?.full_name || '').toLowerCase() !== repo().toLowerCase()) return res.status(403).json({ error: 'Repository mismatch' });

  if (req.headers['x-github-event'] === 'deployment_status') {
    if (payload.deployment_status?.state !== 'success') return res.status(202).json({ ok: true, ignored: 'deployment-not-ready' });
    const previewUrl = payload.deployment_status.environment_url || payload.deployment_status.target_url;
    try {
      const result = await attachPreviewDeployment(payload.deployment?.sha, previewUrl);
      return res.status(200).json({ ok: true, attached: Boolean(result) });
    } catch (error) { return res.status(500).json({ ok: false, error: error.message }); }
  }

  if (req.headers['x-github-event'] !== 'pull_request') return res.status(202).json({ ok: true, ignored: 'event' });

  const allowedActions = new Set(['opened', 'reopened', 'synchronize', 'labeled', 'ready_for_review']);
  if (!allowedActions.has(payload.action)) return res.status(202).json({ ok: true, ignored: 'action' });
  if (payload.action === 'labeled' && payload.label?.name !== 'editorial-review') return res.status(202).json({ ok: true, ignored: 'label' });

  const pr = payload.pull_request;
  const labels = (pr?.labels || []).map((label) => label.name);
  if (!pr || pr.state !== 'open' || pr.base?.ref !== 'main' || !labels.includes('editorial-review')) {
    return res.status(202).json({ ok: true, ignored: 'not-editorial-review' });
  }

  try {
    const review = await reviewEditorialPr(pr);
    return res.status(200).json({ ok: true, pullRequest: pr.number, score: review.score, failures: review.failures });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
