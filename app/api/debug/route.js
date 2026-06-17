import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request) {
  return NextResponse.json({
    success: true,
    env: {
      hasScrapeDoToken: !!process.env.SCRAPE_DO_TOKEN,
      scrapeDoTokenLength: process.env.SCRAPE_DO_TOKEN ? process.env.SCRAPE_DO_TOKEN.length : 0,
      hasScrapingAntKey: !!process.env.SCRAPINGANT_API_KEY,
      scrapingAntKeyLength: process.env.SCRAPINGANT_API_KEY ? process.env.SCRAPINGANT_API_KEY.length : 0,
      cloudflareWorkerProxyUrl: process.env.CLOUDFLARE_WORKER_PROXY_URL || 'not set',
      nodeEnv: process.env.NODE_ENV
    }
  });
}
