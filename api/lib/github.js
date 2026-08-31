const API = 'https://api.github.com';

function repo() {
  const value = process.env.GITHUB_REPOSITORY || (process.env.GITHUB_OWNER && process.env.GITHUB_REPO ? `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}` : '');
  if (!value || !/^[^/]+\/[^/]+$/.test(value)) throw new Error('Set GITHUB_REPOSITORY or both GITHUB_OWNER and GITHUB_REPO.');
  return value;
}

async function github(path, options = {}) {
  const response = await fetch(`${API}/repos/${repo()}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body && body.message ? body.message : `GitHub request failed (${response.status}).`);
    error.status = response.status;
    error.response = body;
    throw error;
  }
  return body;
}

async function file(path, ref) {
  const data = await github(`/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}` + (ref ? `?ref=${encodeURIComponent(ref)}` : ''));
  return { sha: data.sha, text: Buffer.from(data.content, 'base64').toString('utf8') };
}

async function commitFiles(branch, files, message) {
  const ref = await github(`/git/ref/heads/${branch}`);
  const parent = await github(`/git/commits/${ref.object.sha}`);
  const blobs = await Promise.all(files.map(async (item) => ({
    path: item.path,
    sha: (await github('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: Buffer.from(item.text).toString('base64'), encoding: 'base64' })
    })).sha
  })));
  const tree = await github('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: blobs.map((item) => ({ path: item.path, mode: '100644', type: 'blob', sha: item.sha }))
    })
  });
  const commit = await github('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parent.sha] })
  });
  await github(`/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return commit;
}

async function ensureLabel(name, color, description) {
  try { return await github(`/labels/${encodeURIComponent(name)}`); }
  catch (error) {
    if (error.status !== 404) throw error;
    return github('/labels', { method: 'POST', body: JSON.stringify({ name, color, description }) });
  }
}

async function addLabel(number, name, options = {}) {
  await ensureLabel(name, options.color || 'D4A72C', options.description || 'Editorial workflow label');
  return github(`/issues/${number}/labels`, { method: 'POST', body: JSON.stringify({ labels: [name] }) });
}

async function removeLabel(number, name) {
  try { return await github(`/issues/${number}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' }); }
  catch (error) { if (error.status !== 404) throw error; return null; }
}

module.exports = { repo, github, file, commitFiles, ensureLabel, addLabel, removeLabel };
