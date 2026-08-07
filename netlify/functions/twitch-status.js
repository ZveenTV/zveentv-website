// netlify/functions/twitch-status.js
// Liefert den Live-Status und die aktuelle Zuschauerzahl von ZveenTV.

const CHANNEL = 'zveentv';
let cachedToken = null;
let cachedTokenExpiry = 0;

async function twitchFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5000),
  });
}

async function getAppAccessToken(clientId, clientSecret, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < cachedTokenExpiry) return cachedToken;

  const res = await twitchFetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) throw new Error(`Twitch OAuth Fehler: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + Math.max(0, data.expires_in - 60) * 1000;
  return cachedToken;
}

async function getStream(clientId, token) {
  return twitchFetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(CHANNEL)}`, {
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${token}`,
    },
  });
}

exports.handler = async function () {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=15',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
  };

  if (!clientId || !clientSecret) {
    return { statusCode: 200, headers, body: JSON.stringify({ live: false, configured: false }) };
  }

  try {
    let token = await getAppAccessToken(clientId, clientSecret);
    let res = await getStream(clientId, token);

    // Falls Twitch ein abgelaufenes Token meldet, einmal sauber erneuern.
    if (res.status === 401) {
      cachedToken = null;
      cachedTokenExpiry = 0;
      token = await getAppAccessToken(clientId, clientSecret, true);
      res = await getStream(clientId, token);
    }

    if (!res.ok) throw new Error(`Twitch API Fehler: ${res.status}`);

    const data = await res.json();
    const stream = Array.isArray(data.data) ? data.data[0] : null;

    if (!stream) {
      return { statusCode: 200, headers, body: JSON.stringify({ live: false, configured: true }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        live: true,
        configured: true,
        viewers: Number(stream.viewer_count) || 0,
        title: stream.title || '',
        game: stream.game_name || '',
        startedAt: stream.started_at || null,
      }),
    };
  } catch (error) {
    console.error('twitch-status:', error?.message || error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ live: false, configured: true, error: 'temporarily_unavailable' }),
    };
  }
};
