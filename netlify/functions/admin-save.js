const crypto = require('crypto');

function verify(token, secret) {
  if (!token || !secret || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return Number(payload.exp) > Date.now();
  } catch (_) { return false; }
}

function validate(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.home || typeof data.home.tagline !== 'string') return false;
  if (!data.about || !Array.isArray(data.about.paragraphs) || !Array.isArray(data.about.stats)) return false;
  if (!data.equipment || !Array.isArray(data.equipment.pc) || !Array.isArray(data.equipment.audio) || !Array.isArray(data.equipment.accessories)) return false;
  if (!Array.isArray(data.clips) || data.clips.length > 30) return false;
  if (!data.socials || typeof data.socials !== 'object') return false;
  return true;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verify(token, process.env.ADMIN_SESSION_SECRET)) {
    return { statusCode: 401, headers:{'Content-Type':'application/json'}, body: JSON.stringify({error:'unauthorized'}) };
  }

  const ghToken = process.env.GITHUB_CONTENT_TOKEN;
  const repo = process.env.GITHUB_REPO || 'ZveenTV/zveentv-website';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!ghToken) return { statusCode: 503, headers:{'Content-Type':'application/json'}, body: JSON.stringify({error:'github_not_configured'}) };

  let data;
  try { data = JSON.parse(event.body || '{}').data; } catch (_) {}
  if (!validate(data)) return { statusCode: 400, headers:{'Content-Type':'application/json'}, body: JSON.stringify({error:'invalid_data'}) };

  const api = `https://api.github.com/repos/${repo}/contents/site-data.json`;
  const commonHeaders = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ZveenTV-Admin'
  };

  try {
    const currentRes = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: commonHeaders });
    if (!currentRes.ok) throw new Error(`read_${currentRes.status}`);
    const current = await currentRes.json();

    const saveRes = await fetch(api, {
      method: 'PUT',
      headers: { ...commonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update website content from admin',
        content: Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64'),
        sha: current.sha,
        branch
      })
    });
    if (!saveRes.ok) throw new Error(`write_${saveRes.status}`);
    const saved = await saveRes.json();
    return {
      statusCode: 200,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
      body: JSON.stringify({ok:true, commit:saved.commit && saved.commit.sha})
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers:{'Content-Type':'application/json'}, body: JSON.stringify({error:'publish_failed'}) };
  }
};