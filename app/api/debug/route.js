import { NextResponse } from 'next/server';
import { fetchViaScraperProxy } from '../../../lib/proxy-fetch.js';

export const runtime = 'edge';

export async function GET(request) {
  const antKeySet = !!process.env.SCRAPINGANT_API_KEY;
  const scrapeDoSet = !!process.env.SCRAPE_DO_TOKEN;
  const testUrl = 'https://vcloud.zip/3699fyu95ym3ma6';

  const debug = {
    env: {
      SCRAPINGANT_API_KEY_SET: antKeySet,
      SCRAPE_DO_TOKEN_SET: scrapeDoSet
    },
    url: testUrl,
    tokenUrl: null,
    landingPageStatus: null,
    landingPageHtmlSnippet: null,
    tokenPageStatus: null,
    tokenPageHtmlSnippet: null,
    parsedServers: null
  };

  try {
    // Step 1: Fetch Base Landing Page
    const landingPageResponse = await fetchViaScraperProxy(testUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });

    debug.landingPageStatus = landingPageResponse.status;
    const html = await landingPageResponse.text();
    debug.landingPageHtmlSnippet = html.slice(0, 1500);

    // Step 2: Try parsing links directly
    let servers = parseServerLinks(html);
    if (servers['Server 1'] || servers['Server 2'] || servers['Server 3']) {
      debug.parsedServers = servers;
      return NextResponse.json({ success: true, debug, note: 'Parsed directly from landing page' });
    }

    // Step 3: Extract intermediate token URL
    let tokenUrl = null;

    // Regex 3a: Extract from JS variable: var url = '...'
    const varUrlMatch = html.match(/var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    if (varUrlMatch) {
      tokenUrl = varUrlMatch[1];
      debug.tokenUrlMethod = 'Regex 3a (var url)';
    }

    // Regex 3b: Extract from anchor tag with id="download"
    if (!tokenUrl) {
      const aTagRegex = /<a\s+([^>]+)>(.*?)<\/a>/gis;
      let match;
      while ((match = aTagRegex.exec(html)) !== null) {
        const attributes = match[1];
        const innerText = match[2].toLowerCase();
        const idMatch = attributes.match(/id=["']([^"']+)["']/i);
        const id = idMatch ? idMatch[1] : '';

        if (id === 'download' || innerText.includes('generate direct download') || innerText.includes('generate download')) {
          const hrefMatch = attributes.match(/href=["']([^"']+)["']/i);
          if (hrefMatch && hrefMatch[1].startsWith('http')) {
            tokenUrl = hrefMatch[1];
            debug.tokenUrlMethod = 'Regex 3b (id=download)';
            break;
          }
        }
      }
    }

    // Regex 3c: Extract and decode Base64 URL: url = atob('...')
    if (!tokenUrl) {
      const atobMatch = html.match(/url\s*=\s*atob\(['"]([A-Za-z0-9+/=]+)['"]\)/i);
      if (atobMatch) {
        try {
          tokenUrl = atob(atobMatch[1]);
          debug.tokenUrlMethod = 'Regex 3c (atob)';
        } catch (e) {
          debug.tokenUrlError = e.message;
        }
      }
    }

    debug.tokenUrl = tokenUrl;

    if (!tokenUrl) {
      return NextResponse.json({ success: false, error: 'Could not find token URL', debug });
    }

    // Step 4: Fetch Token Page
    const tokenResponse = await fetchViaScraperProxy(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': testUrl
      }
    });

    debug.tokenPageStatus = tokenResponse.status;
    const tokenHtml = await tokenResponse.text();
    debug.tokenPageHtmlSnippet = tokenHtml.slice(0, 1500);

    // Step 5: Parse Server Links
    servers = parseServerLinks(tokenHtml);
    debug.parsedServers = servers;

  } catch (error) {
    debug.error = error.message;
  }

  return NextResponse.json({ success: true, debug });
}

function parseServerLinks(html) {
  const resolved = {};
  const aTagRegex = /<a\s+([^>]+)>(.*?)<\/a>/gis;
  
  const currentMinute = new Date().getMinutes();
  let match;

  while ((match = aTagRegex.exec(html)) !== null) {
    const attributes = match[1];
    const innerHtml = match[2];

    const hrefMatch = attributes.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const href = hrefMatch[1];
    if (href === '#' || !href) continue;

    const hrefLower = href.toLowerCase();
    
    // Filter non-media endpoints
    if (
      hrefLower.includes('css') || hrefLower.includes('fonts') || 
      hrefLower.includes('favicon') || hrefLower.includes('manifest') || 
      hrefLower.includes('telegram') || hrefLower.includes('t.me') || 
      hrefLower.includes('/tg/') || hrefLower.includes('google.com') ||
      hrefLower.includes('github.com') || hrefLower.includes('admin') ||
      hrefLower.includes('login') || hrefLower.includes('signup') ||
      hrefLower.includes('hubcloud.php')
    ) {
      continue;
    }

    const idMatch = attributes.match(/id=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : '';

    if (id === 'fsl' || innerHtml.includes('[FSL Server]')) {
      resolved['Server 1'] = `${href}1${currentMinute}`;
    }
    else if (id === 's3' || innerHtml.includes('[FSLv2 Server]')) {
      if (hrefLower.includes('x-amz-signature') || hrefLower.includes('r2.cloudflarestorage') || hrefLower.includes('r2.dev')) {
        resolved['Server 2'] = href;
      } else {
        resolved['Server 2'] = `${href}_1${currentMinute}`;
      }
    }
    else if (
      innerHtml.includes('[Server : 10Gbps]') || 
      hrefLower.includes('pixel.hubcloud') || 
      hrefLower.includes('gpdl') || 
      (hrefLower.includes('hubcloud') && hrefLower.includes('id='))
    ) {
      resolved['Server 3'] = href;
    }
  }

  return resolved;
}
