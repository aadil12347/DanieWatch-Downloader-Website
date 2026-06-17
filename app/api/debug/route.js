import { NextResponse } from 'next/server';
import { fetchViaScraperProxy } from '../../../lib/proxy-fetch.js';

export const runtime = 'edge';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function GET(request) {
  const landingUrl = 'https://vcloud.zip/oxh6gk_td6_cq9s';
  const debug = {
    landingUrl,
    env: {
      hasScrapeDoToken: !!process.env.SCRAPE_DO_TOKEN,
      hasScrapingAntKey: !!process.env.SCRAPINGANT_API_KEY
    }
  };

  try {
    // ─── STEP 1: Fetch Landing Page ───
    console.log('[Debug Route] Step 1: Fetching landing page');
    const landingRes = await fetchViaScraperProxy(landingUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 15000
    });
    
    debug.landingStatus = landingRes.status;
    const landingHtml = await landingRes.text();
    debug.landingSize = landingHtml.length;

    // Extract tokenUrl
    let tokenUrl = null;
    const varUrlMatch = landingHtml.match(/var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    if (varUrlMatch) {
      tokenUrl = varUrlMatch[1];
    }

    if (!tokenUrl) {
      const atobMatch = landingHtml.match(/url\s*=\s*atob\(['"]([A-Za-z0-9+/=]+)['"]\)/i);
      if (atobMatch) {
        try {
          tokenUrl = atob(atobMatch[1]);
        } catch (e) {}
      }
    }

    debug.tokenUrl = tokenUrl;

    if (!tokenUrl) {
      return NextResponse.json({ success: false, error: 'Could not find token URL on landing page', debug });
    }

    // ─── STEP 2: Fetch Token Page ───
    console.log('[Debug Route] Step 2: Fetching token page:', tokenUrl);
    const tokenRes = await fetchViaScraperProxy(tokenUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': landingUrl
      },
      timeoutMs: 15000
    });

    debug.tokenStatus = tokenRes.status;
    const tokenHtml = await tokenRes.text();
    debug.tokenSize = tokenHtml.length;
    debug.hasFslElementInHtml = tokenHtml.includes('id="fsl"') || tokenHtml.includes('id=\'fsl\'') || tokenHtml.includes('fsl');

    // Parse download server links
    const servers = {};
    const aTagRegex = /<a\s+([^>]+)>(.*?)<\/a>/gis;
    const currentMinute = new Date().getMinutes();
    
    let match;
    while ((match = aTagRegex.exec(tokenHtml)) !== null) {
      const attributes = match[1];
      const innerHtml = match[2];
      const hrefMatch = attributes.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) continue;

      const href = hrefMatch[1];
      if (href === '#' || !href) continue;

      const hrefLower = href.toLowerCase();
      const idMatch = attributes.match(/id=["']([^"']+)["']/i);
      const id = idMatch ? idMatch[1] : '';

      if (id === 'fsl' || innerHtml.includes('[FSL Server]')) {
        if (hrefLower.includes('x-amz-signature') || hrefLower.includes('r2.cloudflarestorage') || hrefLower.includes('r2.dev')) {
          servers['Server 1'] = href;
        } else {
          servers['Server 1'] = `${href}1${currentMinute}`;
        }
      } else if (id === 's3' || innerHtml.includes('[FSLv2 Server]')) {
        if (hrefLower.includes('x-amz-signature') || hrefLower.includes('r2.cloudflarestorage') || hrefLower.includes('r2.dev')) {
          servers['Server 2'] = href;
        } else {
          servers['Server 2'] = `${href}_1${currentMinute}`;
        }
      } else if (
        innerHtml.includes('[Server : 10Gbps]') || 
        hrefLower.includes('pixel.hubcloud') || 
        hrefLower.includes('gpdl') || 
        (hrefLower.includes('hubcloud') && hrefLower.includes('id='))
      ) {
        servers['Server 3'] = href;
      }
    }

    debug.servers = servers;

  } catch (error) {
    debug.error = error.message;
  }

  return NextResponse.json({ success: !debug.error, debug });
}
