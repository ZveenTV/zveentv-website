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
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });

  if (!response.ok) throw new Error(`OAuth ${response.status}`);
  const data = await response.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + Math.max(60, data.expires_in - 60) * 1000;
  return cachedToken;
}

async function twitchFetch(url, clientId, token) {
  const response = await fetch(url, {
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error(`Twitch API ${response.status}`);
  return response.json();
}

async function getBroadcasterId(clientId, token) {
  const payload = await twitchFetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(CHANNEL)}`,
    clientId,
    token
  );
  const user = payload.data?.[0];
  if (!user?.id) throw new Error('Broadcaster not found');
  return user.id;
}

async function fetchTopClips(clientId, token) {
  const broadcasterId = await getBroadcasterId(clientId, token);
  const all = [];
  let cursor = '';

  // Twitch liefert Clips chronologisch/paginiert. Wir holen mehrere Seiten und
  // sortieren anschließend selbst nach view_count. Dadurch bleiben die sechs
  // stärksten Clips automatisch aktuell, ohne feste Clip-IDs im Code.
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      broadcaster_id: broadcasterId,
      first: '100'
    });
    if (cursor) params.set('after', cursor);

    const payload = await twitchFetch(
      `https://api.twitch.tv/helix/clips?${params.toString()}`,
      clientId,
      token
    );

    const clips = Array.isArray(payload.data) ? payload.data : [];
    all.push(...clips);
    cursor = payload.pagination?.cursor || '';
    if (!cursor || clips.length === 0) break;
  }

  return all
    .sort((a, b) => (Number(b.view_count) || 0) - (Number(a.view_count) || 0))
    .slice(0, 6)
    .map(clip => ({
      id: clip.id,
      title: clip.title || '',
      url: clip.url,
      thumbnail: clip.thumbnail_url,
      views: Number(clip.view_count) || 0,
      duration: clip.duration,
      creator: clip.creator_name,
      createdAt: clip.created_at
    }));
}

exports.handler = async function () {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
  };

  const now = Date.now();
  if (cachedClips && now < cachedClipsExpiry) {
    return { statusCode: 200, headers, body: JSON.stringify({ clips: cachedClips, mode: 'top_views' }) };
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clips: [], error: 'twitch_not_configured' })
    };
  }

  try {
    let token = await getToken(clientId, clientSecret);
    let clips;

    try {
      clips = await fetchTopClips(clientId, token);
    } catch (error) {
      if (!String(error.message).includes('401')) throw error;
      cachedToken = null;
      cachedTokenExpiry = 0;
      token = await getToken(clientId, clientSecret);
      clips = await fetchTopClips(clientId, token);
    }

    cachedClips = clips;
    cachedClipsExpiry = now + 30 * 60 * 1000;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clips, mode: 'top_views' })
    };
  } catch (error) {
    console.error('clips-data:', error?.message || error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clips: [], error: 'fetch_failed' })
    };
  }
};
