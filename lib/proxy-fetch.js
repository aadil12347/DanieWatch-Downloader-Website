const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetches a URL via ScrapingAnt (primary) or Scrape.do (fallback).
 * ScrapingAnt uses real Chrome browsers to bypass Cloudflare Turnstile.
 * 
 * Priority:
 * 1. ScrapingAnt (SCRAPINGANT_API_KEY) — 10,000 free credits/month
 * 2. Scrape.do (SCRAPE_DO_TOKEN) — 1,000 free credits/month
 * 3. Cloudflare Worker proxy or direct fetch
 * 
 * Returns a standard Response object.
 */
export async function fetchViaScraperProxy(url, options = {}) {
  // ─── OPTION 1: ScrapingAnt (primary) ───
  const scrapingAntKey = process.env.SCRAPINGANT_API_KEY;
  
  if (scrapingAntKey) {
    try {
      const antUrl = new URL('https://api.scrapingant.com/v2/general');
      antUrl.searchParams.set('url', url);
      // browser=true enables JS rendering (needed for Cloudflare Turnstile)
      // Costs 10 credits per request with datacenter proxy
      antUrl.searchParams.set('browser', 'true');
      
      // If the caller wants manual redirect handling
      if (options.redirect === 'manual') {
        antUrl.searchParams.set('return_page_source', 'true');
      }

      console.log(`[Proxy] Routing through ScrapingAnt: ${url}`);
      const response = await fetch(antUrl.toString(), {
        method: options.method || 'GET',
        headers: {
          'x-api-key': scrapingAntKey,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        cache: 'no-store'
      });

      if (response.ok || response.status === 404) {
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', '*');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }

      console.warn(`[Proxy] ScrapingAnt returned ${response.status}. Trying fallback...`);
    } catch (error) {
      console.error(`[Proxy] ScrapingAnt failed: ${error.message}. Trying fallback...`);
    }
  }

  // ─── OPTION 2: Scrape.do (fallback) ───
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
      scrapeDoUrl.searchParams.set('super', 'true');
      
      const isManualRedirect = options.redirect === 'manual';
      if (isManualRedirect) {
        scrapeDoUrl.searchParams.set('disableRedirection', 'true');
      }
      
      const fetchHeaders = new Headers();
      for (const [key, val] of Object.entries(headers)) {
        fetchHeaders.set(key, val);
      }
      
      console.log(`[Proxy] Routing through Scrape.do: ${url}`);
      const response = await fetch(scrapeDoUrl.toString(), {
        method: options.method || 'GET',
        headers: fetchHeaders,
        cache: 'no-store'
      });

      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', '*');

      const scrapeDoRedirect = response.headers.get('scrape.do-target-redirected-location') || 
                               response.headers.get('scrape-do-target-redirected-location') ||
                               response.headers.get('location');
                               
      if (scrapeDoRedirect) {
        responseHeaders.set('Location', scrapeDoRedirect);
      }

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
      console.error(`[Proxy] Scrape.do failed: ${error.message}. Falling back to direct fetch.`);
    }
  }

  // ─── OPTION 3: Direct fetch / Cloudflare Worker (localhost only) ───
  const proxyUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL;
  let fetchUrl = url;
  if (proxyUrl && proxyUrl.startsWith('http') && !proxyUrl.includes('your-subdomain')) {
    fetchUrl = `${proxyUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}`;
  }
  
  console.log(`[Proxy] Routing through direct fetch: ${fetchUrl}`);
  return fetch(fetchUrl, options);
}

// Maintain alias for compatibility with other files importing fetchViaScriptProxy
export const fetchViaScriptProxy = fetchViaScraperProxy;
