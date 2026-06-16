const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetches a URL via the Google Apps Script Web App Proxy if configured.
 * Otherwise, falls back to the Cloudflare Worker proxy or standard fetch.
 * 
 * Returns a simulated Response object compatible with basic fetch methods.
 */
export async function fetchViaScriptProxy(url, options = {}) {
  const scriptProxyUrl = process.env.GOOGLE_SCRIPT_PROXY_URL;
  if (!scriptProxyUrl || !scriptProxyUrl.startsWith('http')) {
    // Fall back to Cloudflare Worker proxy or direct fetch
    const proxyUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL;
    let fetchUrl = url;
    if (proxyUrl && proxyUrl.startsWith('http') && !proxyUrl.includes('your-subdomain')) {
      fetchUrl = `${proxyUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}`;
    }
    return fetch(fetchUrl, options);
  }

  try {
    const referer = options.headers?.['Referer'] || options.headers?.['referer'] || '';
    const proxyTarget = `${scriptProxyUrl}?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
    
    const res = await fetch(proxyTarget, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      cache: 'no-store'
    });
    
    if (!res.ok) {
      throw new Error(`Google Script Proxy returned status ${res.status}`);
    }
    
    const payload = await res.json();
    if (payload.success === false || payload.error) {
      throw new Error(`Google Script Proxy Error: ${payload.error || 'Unknown error'}`);
    }
    
    // Return a simulated Response object compatible with standard fetch
    return {
      ok: payload.status >= 200 && payload.status < 300,
      status: payload.status,
      statusText: `Status ${payload.status}`,
      headers: {
        get: (name) => payload.headers?.[name.toLowerCase()] || null
      },
      text: async () => payload.content,
      json: async () => JSON.parse(payload.content)
    };
  } catch (error) {
    console.error(`[Proxy Fetch] Failed to fetch via Google Script Proxy: ${error.message}. Falling back to default fetch.`);
    // Fallback to direct fetch/Cloudflare worker proxy on fetch error
    const proxyUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL;
    let fetchUrl = url;
    if (proxyUrl && proxyUrl.startsWith('http') && !proxyUrl.includes('your-subdomain')) {
      fetchUrl = `${proxyUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}`;
    }
    return fetch(fetchUrl, options);
  }
}
