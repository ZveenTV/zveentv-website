// netlify/functions/twitch-status.js
//
// Liefert den Live-Status und die aktuelle Zuschauerzahl von ZveenTV.
// Wird vom Header-Badge auf der Website aufgerufen (fetch('/.netlify/functions/twitch-status')).
//
// SETUP (einmalig):
// 1. Auf https://dev.twitch.tv/console/apps eine neue App registrieren
//    (OAuth Redirect URL kann z.B. https://deine-domain.tld sein, wird hier nicht gebraucht).
// 2. Client-ID und Client-Secret kopieren.
// 3. Im Netlify-Dashboard unter Site settings -> Environment variables zwei Variablen anlegen:
//      TWITCH_CLIENT_ID     = deine Client-ID
//      TWITCH_CLIENT_SECRET = dein Client-Secret
// 4. Neu deployen. Fertig — die Funktion ist automatisch unter /.netlify/functions/twitch-status erreichbar.

const CHANNEL = 'zveentv';

// Einfaches In-Memory-Caching des App-Access-Tokens, damit nicht bei jedem
// Aufruf ein neues Token geholt werden muss (hält, solange die Funktion "warm" ist).
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAppAccessToken(clientId, clientSecret) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    throw new Error(`Twitch OAuth Fehler: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Token minus 60 Sekunden Sicherheitsabstand cachen
  cachedTokenExpiry = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

exports.handler = async function () {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  const headers = {
    'Content-Type': 'application/json',
    // 30 Sekunden Cache beim CDN, damit nicht jeder Seitenaufruf die Twitch-API trifft
    'Cache-Control': 'public, max-age=30',
    'Access-Control-Allow-Origin': '*',
  };

  if (!clientId || !clientSecret) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ live: false, error: 'not_configured' }),
    };
  }

  try {
    const token = await getAppAccessToken(clientId, clientSecret);

    const res = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${CHANNEL}`,
      {
        headers: {
          'Client-Id': clientId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Twitch API Fehler: ${res.status}`);
    }

    const data = await res.json();
    const stream = data.data && data.data[0];

    if (!stream) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ live: false }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        live: true,
        viewers: stream.viewer_count,
        title: stream.title,
        game: stream.game_name,
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ live: false, error: 'fetch_failed' }),
    };
  }
};
