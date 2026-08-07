const CLIP_IDS = [
  'BadNurturingSnailRlyTho-jCj4Fejr8AXM0EIt',
  'RenownedShinyManateeThunBeast-sKU2Cd4DO_5DR_MR',
  'FunSincereGullHeyGuys-0zpR9ZezQCqHGOA_',
  'FragileMiniatureGuanacoFloof-e8JwEx0ettOBVw8P',
  'DoubtfulAbstruseLampFeelsBadMan-m7CScTTXqMdWnuH8',
  'YummyUgliestMallardNotLikeThis-74agjpJuNJ3INNuR',
  'RelentlessLovelyOtterKreygasm-DcYc840Y2KEufIpg',
  'DaintyWimpyTroutKreygasm-AJ9BnasHz2mMS0xi',
  'FaintCreativeSageEleGiggle-9la1JXW-PjauwS12'
];

let cachedToken = null;
let cachedTokenExpiry = 0;
let cachedClips = null;
let cachedClipsExpiry = 0;

function decodeEntities(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return '';
}

async function scrapeClip(id) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`https://clips.twitch.tv/${encodeURIComponent(id)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ZveenTVWebsite/1.0)',
        Accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Clip page ${response.status}`);
    const html = await response.text();
    let title = getMeta(html, 'og:title');
    const thumbnail = getMeta(html, 'og:image');
    const url = getMeta(html, 'og:url') || `https://clips.twitch.tv/${id}`;
    if (title) title = title.replace(/\s*[-|]\s*Twitch\s*$/i, '').trim();
    return { id, title, thumbnail, url };
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeClips() {
  const results = await Promise.allSettled(CLIP_IDS.map(scrapeClip));
  return results
    .map((result, index) => result.status === 'fulfilled' ? result.value : ({ id: CLIP_IDS[index], title: '', thumbnail: '', url: `https://clips.twitch.tv/${CLIP_IDS[index]}` }))
    .filter(Boolean);
}

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

async function fetchClips(clientId, token) {
  const params = new URLSearchParams();
  CLIP_IDS.forEach(id => params.append('id', id));

  const response = await fetch(`https://api.twitch.tv/helix/clips?${params.toString()}`, {
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) throw new Error(`Clips API ${response.status}`);
  const payload = await response.json();
  const byId = new Map((payload.data || []).map(clip => [clip.id, clip]));

  return CLIP_IDS.map(id => byId.get(id)).filter(Boolean).map(clip => ({
    id: clip.id,
    title: clip.title,
    url: clip.url,
    thumbnail: clip.thumbnail_url,
    views: clip.view_count,
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
    return { statusCode: 200, headers, body: JSON.stringify({ clips: cachedClips }) };
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  try {
    let clips;

    if (clientId && clientSecret) {
      try {
        let token = await getToken(clientId, clientSecret);
        try {
          clips = await fetchClips(clientId, token);
        } catch (error) {
          if (!String(error.message).includes('401')) throw error;
          cachedToken = null;
          cachedTokenExpiry = 0;
          token = await getToken(clientId, clientSecret);
          clips = await fetchClips(clientId, token);
        }
      } catch (_) {
        clips = await scrapeClips();
      }
    } else {
      clips = await scrapeClips();
    }

    cachedClips = clips;
    cachedClipsExpiry = now + 15 * 60 * 1000;
    return { statusCode: 200, headers, body: JSON.stringify({ clips }) };
  } catch (error) {
    return { statusCode: 200, headers, body: JSON.stringify({ clips: [], error: 'fetch_failed' }) };
  }
};
