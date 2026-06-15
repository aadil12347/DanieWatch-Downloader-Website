import crypto from 'crypto';

export function generateClientToken() {
  const timestamp = Math.floor(Date.now() / 1000);
  const reversed = String(timestamp).split('').reverse().join('');
  const md5Hash = crypto.createHash('md5').update(reversed).digest('hex');
  return `${timestamp},${md5Hash}`;
}

export function getBaseHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Client-Info': JSON.stringify({ timezone: 'Asia/Karachi' }),
    'X-Request-Lang': 'en',
    'Authorization': '',
    'X-Client-Token': generateClientToken(),
    'X-Caller-Source': 'node-frontend',
    'X-Site-Domain': 'videodownloader.site',
  };
}

let cachedToken = null;
let cachedTokenTime = 0;

export async function getAuthToken() {
  const now = Date.now();
  // Cache token for 10 minutes
  if (cachedToken && (now - cachedTokenTime < 10 * 60 * 1000)) {
    return cachedToken;
  }

  try {
    const res = await fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search-suggest', {
      method: 'POST',
      headers: getBaseHeaders(),
      body: JSON.stringify({ keyword: 'avatar', perPage: 0 })
    });
    
    const xUser = res.headers.get('x-user');
    if (xUser) {
      const userData = JSON.parse(xUser);
      if (userData && userData.token) {
        cachedToken = userData.token;
        cachedTokenTime = now;
        return cachedToken;
      }
    }
  } catch (err) {
    console.error('Failed to fetch auth token:', err);
  }

  return cachedToken;
}

