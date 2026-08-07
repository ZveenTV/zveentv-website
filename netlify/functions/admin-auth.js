const crypto = require('crypto');

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!password || !secret) return { statusCode: 503, body: JSON.stringify({error:'admin_not_configured'}) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) {}
  const a = Buffer.from(String(body.password || ''));
  const b = Buffer.from(String(password));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { statusCode: 401, headers:{'Content-Type':'application/json'}, body: JSON.stringify({error:'invalid_credentials'}) };
  }

  const token = sign({exp: Date.now() + 8*60*60*1000}, secret);
  return { statusCode: 200, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify({token}) };
};