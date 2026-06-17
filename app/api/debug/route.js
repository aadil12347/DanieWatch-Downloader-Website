import { NextResponse } from 'next/server';
import { fetchViaScraperProxy } from '../../../lib/proxy-fetch.js';

export const runtime = 'edge';

export async function GET(request) {
  const tokenUrl = 'https://vegamovies.mq/?q=ws01qrrwmczfrwf?token=dzRyZ3Npb2RKTlZEQjAwdzR6K3pkWGlSeGhmZGlVK24xNEJKT2YyNzF3Zz0=';
  
  const debug = { tokenUrl };

  try {
    const tokenRes = await fetchViaScraperProxy(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://vcloud.zip/3699fyu95ym3ma6'
      },
      useScrapingAntOnly: true,
      waitForSelector: '#fsl',
      timeoutMs: 25000
    });
    debug.tokenStatus = tokenRes.status;
    const tokenHtml = await tokenRes.text();
    debug.tokenSize = tokenHtml.length;
    debug.hasFSL = tokenHtml.includes('fsl') || tokenHtml.includes('FSL');
    debug.hasHubcloud = tokenHtml.includes('hubcloud') || tokenHtml.includes('HubCloud');
    debug.has10Gbps = tokenHtml.includes('10Gbps');

    // Extract download-related anchors only
    const anchors = [];
    const aTagRegex = /<a\s+([^>]+)>(.*?)<\/a>/gis;
    let m;
    while ((m = aTagRegex.exec(tokenHtml)) !== null) {
      const attrs = m[1];
      const inner = m[2].replace(/<[^>]+>/g, '').trim();
      const hrefM = attrs.match(/href=["']([^"']+)["']/i);
      const idM = attrs.match(/id=["']([^"']+)["']/i);
      if (hrefM && (
        hrefM[1].includes('hubcloud') || hrefM[1].includes('gpdl') ||
        hrefM[1].includes('pixel') || hrefM[1].includes('r2.dev') ||
        (idM && (idM[1] === 'fsl' || idM[1] === 's3')) ||
        inner.includes('FSL') || inner.includes('10Gbps') || inner.includes('Server')
      )) {
        anchors.push({ href: hrefM[1].slice(0, 300), id: idM?.[1], text: inner.slice(0, 100) });
      }
    }
    debug.downloadAnchors = anchors;

  } catch (error) {
    debug.error = error.message;
  }

  return NextResponse.json({ success: true, debug });
}
