const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetches a URL via Scrape.do (primary) or ScrapingAnt (fallback).
 * Scrape.do super mode solves Cloudflare Turnstile/WAF challenges reliably.
 * 
 * Priority:
 * 1. Scrape.do (SCRAPE_DO_TOKEN) — 1,000 free credits/month (super mode)
 * 2. ScrapingAnt (SCRAPINGANT_API_KEY) — 10,000 free credits/month
 * 3. Cloudflare Worker proxy or direct fetch
 * 
 * Options:
 * - waitMs: milliseconds to wait after page load for JS rendering (Scrape.do)
 * - waitForSelector: CSS selector to wait for before returning HTML (ScrapingAnt)
 * - timeoutMs: custom timeout (default 10000)
 * - useScrapingAntOnly: skip Scrape.do, go directly to ScrapingAnt (for JS-heavy pages)
 * 
 * Returns a standard Response object.
 */
export async function fetchViaScraperProxy(url, options = {}) {
  const customTimeout = options.timeoutMs || 10000;

  // ─── OPTION 1: Scrape.do (primary - extremely reliable) ───
  // Skip Scrape.do if caller wants ScrapingAnt only (for JS-rendered pages)
  const scrapeDoToken = process.env.SCRAPE_DO_TOKEN;
  
  if (scrapeDoToken && !options.useScrapingAntOnly) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), customTimeout);

    try {
      const headers = { ...options.headers };
      if (!headers['User-Agent'] && !headers['user-agent']) {
        headers['User-Agent'] = USER_AGENT;
      }
      
      const scrapeDoUrl = new URL('http://api.scrape.do');
      scrapeDoUrl.searchParams.set('token', scrapeDoToken);
      scrapeDoUrl.searchParams.set('url', url);
      scrapeDoUrl.searchParams.set('super', 'true');
      
      // Add wait time for JS-rendered pages (e.g., AJAX download links)
      if (options.waitMs) {
        scrapeDoUrl.searchParams.set('wait', String(options.waitMs));
      }
      
      const isManualRedirect = options.redirect === 'manual';
      if (isManualRedirect) {
        scrapeDoUrl.searchParams.set('disableRedirection', 'true');
      }
      
      const fetchHeaders = new Headers();
      for (const [key, val] of Object.entries(headers)) {
        fetchHeaders.set(key, val);
      }
      
      console.log(`[Proxy] Routing through Scrape.do: ${url}${options.waitMs ? ` (wait=${options.waitMs}ms)` : ''}`);
      const response = await fetch(scrapeDoUrl.toString(), {
        method: options.method || 'GET',
        headers: fetchHeaders,
        cache: 'no-store',
        signal: controller.signal
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

      if (response.ok || status === 302 || status === 404) {
        return new Response(response.body, {
          status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }
      console.warn(`[Proxy] Scrape.do returned ${response.status}. Trying ScrapingAnt fallback...`);
    } catch (error) {
      console.error(`[Proxy] Scrape.do failed or timed out: ${error.message}. Trying ScrapingAnt fallback...`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── OPTION 2: ScrapingAnt (fallback) ───
  const scrapingAntKey = process.env.SCRAPINGANT_API_KEY;
  
  if (scrapingAntKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), customTimeout);

    try {
      const antUrl = new URL('https://api.scrapingant.com/v2/general');
      antUrl.searchParams.set('url', url);
      antUrl.searchParams.set('browser', 'true');
      
      // Wait for specific element to appear (for JS-rendered content)
      if (options.waitForSelector) {
        antUrl.searchParams.set('wait_for_selector', options.waitForSelector);
      }
      
      if (options.redirect === 'manual') {
        antUrl.searchParams.set('return_page_source', 'true');
      }

      console.log(`[Proxy] Routing through ScrapingAnt: ${url}${options.waitForSelector ? ` (wait for: ${options.waitForSelector})` : ''}`);
      const response = await fetch(antUrl.toString(), {
        method: options.method || 'GET',
        headers: {
          'x-api-key': scrapingAntKey,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        cache: 'no-store',
        signal: controller.signal
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
      console.warn(`[Proxy] ScrapingAnt returned ${response.status}. Trying next fallback...`);
    } catch (error) {
      console.error(`[Proxy] ScrapingAnt failed or timed out: ${error.message}. Trying next fallback...`);
    } finally {
      clearTimeout(timeoutId);
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
