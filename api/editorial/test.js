const { isCronRequest } = require('../../server/automation');
const { createDraftPr, stateFrom } = require('../../server/editorial');
const { github } = require('../../server/github');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST only' });
  if (!isCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const number = String(req.query?.number || '');
      if (!/^\d+$/.test(number)) return res.status(400).json({ ok: false, error: 'Valid PR number is required.' });
      const [pr, main] = await Promise.all([github(`/pulls/${number}`), github('/git/ref/heads/main')]);
      const state = stateFrom(pr.body);
      if (!state?.test) return res.status(404).json({ ok: false, error: 'Test editorial PR not found.' });
      const labels = (pr.labels || []).map((label) => label.name);
      return res.status(200).json({
        ok: true,
        test: true,
        number: pr.number,
        pr: pr.html_url,
        prState: pr.state,
        testNotMerged: !pr.merged,
        mainStillAtBase: main.object.sha === pr.base.sha,
        held: labels.includes('editorial:hold') || state.status === 'held',
        score: state.score,
        failures: state.failures || [],
        reviewedCommitSha: state.reviewedCommitSha || null,
        preview: state.previewUrl || null
      });
    }
    if (String(process.env.EDITORIAL_APPROVAL_ENABLED).toLowerCase() === 'true' || String(process.env.EDITORIAL_AUTOPUBLISH).toLowerCase() === 'true') {
      return res.status(409).json({ ok: false, error: '테스트 전에 EDITORIAL_APPROVAL_ENABLED=false와 EDITORIAL_AUTOPUBLISH=false로 설정하고 재배포해 주세요.' });
    }
    const topic = req.body?.topic || '작은 방에서 수납 위치를 정하는 방법 — 자동화 연결 테스트';
    const pr = await createDraftPr(topic, { test: true });
    const main = await github('/git/ref/heads/main');
    return res.status(201).json({ ok: true, test: true, publishable: false, pr: pr.html_url, number: pr.number, testNotMerged: !pr.merged, mainStillAtBase: main.object.sha === pr.base.sha });
  } catch (error) { return res.status(500).json({ ok: false, error: error.message }); }
};
