import { NextResponse } from 'next/server';

export const runtime = 'edge';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function testScrapeDo(url, token) {
  const start = Date.now();
  try {
    const scrapeDoUrl = new URL('https://api.scrape.do');
    scrapeDoUrl.searchParams.set('token', token);
    scrapeDoUrl.searchParams.set('url', url);
    scrapeDoUrl.searchParams.set('super', 'true');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(scrapeDoUrl.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const html = await res.text();

    return {
      success: res.ok,
      status: res.status,
      durationMs: Date.now() - start,
      htmlLength: html.length,
      snippet: html.slice(0, 300),
      isBlocked: html.includes('Turnstile') || html.includes('WAF') || html.includes('Challenge')
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      durationMs: Date.now() - start
    };
  }
}

async function testScrapingAnt(url, key, useBrowser) {
  const start = Date.now();
  try {
    const antUrl = new URL('https://api.scrapingant.com/v2/general');
    antUrl.searchParams.set('url', url);
    antUrl.searchParams.set('browser', useBrowser ? 'true' : 'false');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(antUrl.toString(), {
      headers: { 'x-api-key': key },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const html = await res.text();

    return {
      success: res.ok,
      status: res.status,
      durationMs: Date.now() - start,
      htmlLength: html.length,
      snippet: html.slice(0, 300),
      isBlocked: html.includes('Turnstile') || html.includes('WAF') || html.includes('Challenge')
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      durationMs: Date.now() - start
    };
  }
}

export async function GET(request) {
  const testUrl = 'https://vcloud.zip/oxh6gk_td6_cq9s';
  const scrapeDoToken = process.env.SCRAPE_DO_TOKEN;
  const scrapingAntKey = process.env.SCRAPINGANT_API_KEY;

  const results = {
    testUrl,
    scrapeDo: null,
    scrapingAntRaw: null,
    scrapingAntBrowser: null
  };

  if (scrapeDoToken) {
    results.scrapeDo = await testScrapeDo(testUrl, scrapeDoToken);
  } else {
    results.scrapeDo = { success: false, error: 'Token not set in env' };
  }

  if (scrapingAntKey) {
    results.scrapingAntRaw = await testScrapingAnt(testUrl, scrapingAntKey, false);
    results.scrapingAntBrowser = await testScrapingAnt(testUrl, scrapingAntKey, true);
  } else {
    results.scrapingAntRaw = { success: false, error: 'API Key not set in env' };
    results.scrapingAntBrowser = { success: false, error: 'API Key not set in env' };
  }

  return NextResponse.json({ success: true, results });
}
