const CHANNEL = 'zveentv';

let cachedToken = null;
let cachedTokenExpiry = 0;
let cachedClips = null;
let cachedClipsExpiry = 0;

async function getToken(clientId, clientSecret) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
  });
  if (!response.ok) throw new Error(`OAuth ${response.status}`);
  const data = await response.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + Math.max(60, data.expires_in - 60) * 1000;
  return cachedToken;
}

async function twitchFetch(url, clientId, token) {
  const response = await fetch(url, { headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Twitch API ${response.status}`);
  return response.json();
}

function normalizeClip(clip) {
  return {
    id: clip.id,
    title: clip.title || '',
    url: clip.url,
    thumbnail: clip.thumbnail_url,
    views: Number(clip.view_count) || 0,
    duration: clip.duration,
    creator: clip.creator_name,
    createdAt: clip.created_at
  };
}

async function getBroadcasterId(clientId, token) {
  const payload = await twitchFetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(CHANNEL)}`, clientId, token);
  const user = payload.data?.[0];
  if (!user?.id) throw new Error('Broadcaster not found');
  return user.id;
}

async function fetchLatestClips(clientId, token) {
  const broadcasterId = await getBroadcasterId(clientId, token);
  const params = new URLSearchParams({ broadcaster_id: broadcasterId, first: '20' });
  const payload = await twitchFetch(`https://api.twitch.tv/helix/clips?${params.toString()}`, clientId, token);
  return (Array.isArray(payload.data) ? payload.data : [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3).map(normalizeClip);
}

async function fetchClipsByIds(ids, clientId, token) {
  const unique = [...new Set(ids)].filter(Boolean).slice(0, 20);
  if (!unique.length) return [];
  const params = new URLSearchParams();
  unique.forEach(id => params.append('id', id));
  const payload = await twitchFetch(`https://api.twitch.tv/helix/clips?${params.toString()}`, clientId, token);
  const byId = new Map((payload.data || []).map(c => [c.id, normalizeClip(c)]));
  return unique.map(id => byId.get(id)).filter(Boolean);
}

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=1800' };
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { statusCode: 200, headers, body: JSON.stringify({ clips: [], error: 'twitch_not_configured' }) };

  try {
    let token = await getToken(clientId, clientSecret);
    const requestedIds = String(event?.queryStringParameters?.ids || '').split(',').map(v => v.trim()).filter(Boolean);
    let clips;
    const load = () => requestedIds.length ? fetchClipsByIds(requestedIds, clientId, token) : fetchLatestClips(clientId, token);
    try { clips = await load(); }
    catch (error) {
      if (!String(error.message).includes('401')) throw error;
      cachedToken = null; cachedTokenExpiry = 0; token = await getToken(clientId, clientSecret); clips = await load();
    }
    if (!requestedIds.length) { cachedClips = clips; cachedClipsExpiry = Date.now() + 5 * 60 * 1000; }
    return { statusCode: 200, headers, body: JSON.stringify({ clips, mode: requestedIds.length ? 'ids' : 'latest' }) };
  } catch (error) {
    console.error('clips-data:', error?.message || error);
    return { statusCode: 200, headers, body: JSON.stringify({ clips: [], error: 'fetch_failed' }) };
  }
};