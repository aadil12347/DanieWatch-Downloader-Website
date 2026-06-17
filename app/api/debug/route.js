import { NextResponse } from 'next/server';
import { fetchViaScraperProxy } from '../../../lib/proxy-fetch.js';

export const runtime = 'edge';

export async function GET(request) {
  // We already know the token URL from Step 1 - skip the landing page entirely
  const tokenUrl = 'https://vegamovies.mq/?q=ws01qrrwmczfrwf?token=dzRyZ3Npb2RKTlZEQjAwdzR6K3pkWGlSeGhmZGlVK24xNEJKT2YyNzF3Zz0=';
  
  const debug = { tokenUrl };

  try {
    const tokenRes = await fetchViaScraperProxy(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://vcloud.zip/3699fyu95ym3ma6'
      }
    });
    debug.tokenStatus = tokenRes.status;
    const tokenHtml = await tokenRes.text();
    debug.tokenSize = tokenHtml.length;
    debug.tokenHtml = tokenHtml.slice(0, 8000);

    // Extract ALL hrefs
    const allLinks = [];
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let m;
    while ((m = hrefRegex.exec(tokenHtml)) !== null) {
      allLinks.push(m[1]);
    }
    debug.allHrefs = allLinks;

    // Extract ALL anchor tags
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
