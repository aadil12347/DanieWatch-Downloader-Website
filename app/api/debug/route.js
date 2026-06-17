import { NextResponse } from 'next/server';
import { fetchViaScraperProxy } from '../../../lib/proxy-fetch.js';

export const runtime = 'edge';

export async function GET(request) {
  const testUrl = 'https://vcloud.zip/3699fyu95ym3ma6';

  const debug = {
    env: {
      SCRAPINGANT_API_KEY_SET: !!process.env.SCRAPINGANT_API_KEY,
      SCRAPE_DO_TOKEN_SET: !!process.env.SCRAPE_DO_TOKEN
    },
    url: testUrl
  };

  try {
    // Step 1: Fetch landing page
    const landingRes = await fetchViaScraperProxy(testUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    debug.landingStatus = landingRes.status;
    const html = await landingRes.text();
    debug.landingSize = html.length;

    // Extract token URL
    let tokenUrl = null;
    const varUrlMatch = html.match(/var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    if (varUrlMatch) tokenUrl = varUrlMatch[1];
    debug.tokenUrl = tokenUrl;

    if (!tokenUrl) {
      return NextResponse.json({ success: false, error: 'No token URL found', debug });
    }

    // Step 2: Fetch token page
    const tokenRes = await fetchViaScraperProxy(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': testUrl
      }
    });
    debug.tokenStatus = tokenRes.status;
    const tokenHtml = await tokenRes.text();
    debug.tokenSize = tokenHtml.length;
    debug.tokenHtmlFull = tokenHtml.slice(0, 8000);

    // Extract ALL href links from the token page
    const allLinks = [];
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let m;
    while ((m = hrefRegex.exec(tokenHtml)) !== null) {
      allLinks.push(m[1]);
    }
    debug.allHrefs = allLinks;

    // Extract ALL anchor tags with their inner text
    const allAnchors = [];
    const aTagRegex = /<a\s+([^>]+)>(.*?)<\/a>/gis;
    while ((m = aTagRegex.exec(tokenHtml)) !== null) {
      const attrs = m[1];
      const inner = m[2].replace(/<[^>]+>/g, '').trim();
      const hrefM = attrs.match(/href=["']([^"']+)["']/i);
      const idM = attrs.match(/id=["']([^"']+)["']/i);
      allAnchors.push({
        href: hrefM ? hrefM[1] : null,
        id: idM ? idM[1] : null,
        text: inner.slice(0, 200)
      });
    }
    debug.allAnchors = allAnchors;

  } catch (error) {
    debug.error = error.message;
  }

  return NextResponse.json({ success: true, debug });
}
