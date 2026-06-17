import { NextResponse } from 'next/server';
import { fetchViaScraperProxy } from '../../../lib/proxy-fetch.js';

export const runtime = 'edge';

export async function GET(request) {
  const antKeySet = !!process.env.SCRAPINGANT_API_KEY;
  const scrapeDoSet = !!process.env.SCRAPE_DO_TOKEN;
  const cfWorkerUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL || 'Not defined';

  const testUrl = 'https://vcloud.zip/3699fyu95ym3ma6';
  const debugResults = [];

  try {
    const response = await fetchViaScraperProxy(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const text = await response.text();
    const sizeMatch = text.match(/id=["']size["']>([^<]+)<\/i>/i);
    const titleMatch = text.match(/<title>([^<]+)<\/title>/i);

    debugResults.push({
      step: 'Proxy Fetch Test',
      status: response.status,
      sizeFound: !!sizeMatch,
      sizeValue: sizeMatch ? sizeMatch[1].trim() : null,
      title: titleMatch ? titleMatch[1].trim() : 'No Title',
      htmlSnippet: text.slice(0, 1000),
      isBlocked: text.includes('Turnstile') || text.includes('challenge-running') || text.includes('Cloudflare') || text.includes('Security Check')
    });
  } catch (error) {
    debugResults.push({
      step: 'Proxy Fetch Test',
      error: error.message
    });
  }

  return NextResponse.json({
    env: {
      SCRAPINGANT_API_KEY_SET: antKeySet,
      SCRAPE_DO_TOKEN_SET: scrapeDoSet,
      CLOUDFLARE_WORKER_PROXY_URL: cfWorkerUrl
    },
    testUrl,
    results: debugResults
  });
}
