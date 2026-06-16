const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetches a URL via the Scrape.do API if configured (Turnstile/CAPTCHA bypass).
 * Otherwise, falls back to the Cloudflare Worker proxy or direct fetch.
 * 
 * Returns a standard Response object.
 */
export async function fetchViaScraperProxy(url, options = {}) {
  const scrapeDoToken = process.env.SCRAPE_DO_TOKEN;
  
  if (scrapeDoToken) {
    try {
      const headers = { ...options.headers };
      if (!headers['User-Agent'] && !headers['user-agent']) {
        headers['User-Agent'] = USER_AGENT;
      }
      
      const scrapeDoUrl = new URL('http://api.scrape.do');
      scrapeDoUrl.searchParams.set('token', scrapeDoToken);
      scrapeDoUrl.searchParams.set('url', url);
      // 'super' parameter tells Scrape.do to solve Cloudflare Turnstile/WAF challenges automatically
      scrapeDoUrl.searchParams.set('super', 'true');
      
      // If client requested manual redirect tracing, tell Scrape.do not to auto-redirect
      const isManualRedirect = options.redirect === 'manual';
      if (isManualRedirect) {
        scrapeDoUrl.searchParams.set('disableRedirection', 'true');
      }
      
      const fetchHeaders = new Headers();
      for (const [key, val] of Object.entries(headers)) {
        fetchHeaders.set(key, val);
      }
      
      console.log(`[Scraper Proxy] Routing through Scrape.do: ${url}`);
      const response = await fetch(scrapeDoUrl.toString(), {
        method: options.method || 'GET',
        headers: fetchHeaders,
        cache: 'no-store'
      });

      // Construct a new Response to inject headers and status codes cleanly
      const responseHeaders = new Headers(response.headers);
      
      // Inject standard CORS headers
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', '*');

      // Map Scrape.do redirection header to standard Location header
      const scrapeDoRedirect = response.headers.get('scrape.do-target-redirected-location') || 
                               response.headers.get('scrape-do-target-redirected-location') ||
                               response.headers.get('location');
                               
      if (scrapeDoRedirect) {
        responseHeaders.set('Location', scrapeDoRedirect);
      }

      // If a redirect was detected and the caller requested manual redirect tracking,
      // simulate the standard 302 status code
      let status = response.status;
      if (isManualRedirect && scrapeDoRedirect && status === 200) {
        status = 302;
      }

      return new Response(response.body, {
        status,
        statusText: response.statusText,
        headers: responseHeaders
      });
      
    } catch (error) {
      console.error(`[Scraper Proxy] Scrape.do request failed: ${error.message}. Falling back to default.`);
    }
  }

  // Fallback: Direct fetch or Cloudflare worker proxy (best for localhost)
  const proxyUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL;
  let fetchUrl = url;
  if (proxyUrl && proxyUrl.startsWith('http') && !proxyUrl.includes('your-subdomain')) {
    fetchUrl = `${proxyUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}`;
  }
  
  console.log(`[Scraper Proxy] Routing through default fetch: ${fetchUrl}`);
  return fetch(fetchUrl, options);
}

// Maintain alias for compatibility with other files importing fetchViaScriptProxy
export const fetchViaScriptProxy = fetchViaScraperProxy;
