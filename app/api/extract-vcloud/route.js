import { NextResponse } from 'next/server';
import { fetchViaScriptProxy } from '../../../lib/proxy-fetch.js';

// Edge runtime gives us 30-second timeout (vs 10s for Node.js on Vercel Hobby)
// This is critical because Scrape.do's super mode needs 10-30s to solve Cloudflare Turnstile
export const runtime = 'edge';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


const AD_KEYWORDS = [
  'bit.ly', 'tinyurl', 'cutt.ly', 'linkvertise', 'adf.ly', 'shorturl',
  'doubleclick', 'popads', 'onclickads', 'exoclick', 'adsterra', 'adlink',
  'winexch', 'lotus', 'bet', 'casino', '1xbet', 'mostbet', 'parimatch',
  'melbet', 'dafanews', 'sportybet', 'betway', 'bet365', 'adsystem',
  'adservices', 'googlesyndication', 'googleadservices'
];

export async function POST(req) {
  try {
    const { url, step, tokenUrl: clientTokenUrl } = await req.json();

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Valid VCloud URL is required' }, { status: 400 });
    }

    // ─── STEP 2: Fetch Token Page & Resolve Final Links ───
    if (step === 'token') {
      if (!clientTokenUrl) {
        return NextResponse.json({ error: 'tokenUrl is required for token step' }, { status: 400 });
      }

      console.log(`[VCloud Extractor] Step 2: Fetching token page: ${clientTokenUrl}`);
      const tokenResponse = await fetchViaScriptProxy(clientTokenUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': url
        },
        // The token page download links (FSL, FSLv2, HubCloud) are in the raw HTML.
        // We do not need a headless browser to render JavaScript.
        timeoutMs: 25000             // 25s timeout (within Vercel 30s edge limit)
      });

      if (!tokenResponse.ok) {
        return NextResponse.json({ error: `Failed to fetch token page. Status: ${tokenResponse.status}` }, { status: 502 });
      }

      const tokenHtml = await tokenResponse.text();
      let servers = parseServerLinks(tokenHtml);

      // Trace redirect chains (HubCloud / GPDL)
      servers = await resolveRedirectsForServers(servers);

      return NextResponse.json({ success: true, servers });
    }

    // ─── STEP 1: Fetch Base Landing Page ───
    console.log(`[VCloud Extractor] Step 1: Extracting landing page: ${url}`);
    const landingPageResponse = await fetchViaScriptProxy(url, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!landingPageResponse.ok) {
      return NextResponse.json({ error: `Failed to load landing page. Status: ${landingPageResponse.status}` }, { status: 502 });
    }

    const html = await landingPageResponse.text();

    // Check if links are already pre-generated directly on the landing page
    let servers = parseServerLinks(html);
    if (servers['Server 1'] || servers['Server 2'] || servers['Server 3']) {
      servers = await resolveRedirectsForServers(servers);
      return NextResponse.json({ success: true, servers });
    }

    // Extract intermediate token URL
    let tokenUrl = null;

    // Regex 3a: Extract from JS variable: var url = '...'
    const varUrlMatch = html.match(/var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    if (varUrlMatch) {
      tokenUrl = varUrlMatch[1];
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
        } catch (e) {
          console.error('[VCloud Extractor] Failed to decode base64 URL', e);
        }
      }
    }

    if (!tokenUrl) {
      if (url.includes('token=')) {
        tokenUrl = url;
      } else {
        return NextResponse.json({ error: 'Could not find token URL or download button on page.' }, { status: 404 });
      }
    }

    // Return the tokenUrl to the frontend so it can initiate Step 2
    return NextResponse.json({ success: true, nextStep: 'token', tokenUrl });

  } catch (error) {
    console.error('[VCloud Extractor] API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
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

    // Filter ads
    if (AD_KEYWORDS.some(keyword => hrefLower.includes(keyword))) continue;

    const idMatch = attributes.match(/id=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : '';

    // Server 1 (FSL): appends '1' + current minute unless cloudflare storage links
    if (id === 'fsl' || innerHtml.includes('[FSL Server]')) {
      if (hrefLower.includes('x-amz-signature') || hrefLower.includes('r2.cloudflarestorage') || hrefLower.includes('r2.dev')) {
        resolved['Server 1'] = href;
      } else {
        resolved['Server 1'] = `${href}1${currentMinute}`;
      }
    }
    // Server 2 (FSLv2): appends '_1' + current minute unless cloudflare storage links
    else if (id === 's3' || innerHtml.includes('[FSLv2 Server]')) {
      if (hrefLower.includes('x-amz-signature') || hrefLower.includes('r2.cloudflarestorage') || hrefLower.includes('r2.dev')) {
        resolved['Server 2'] = href;
      } else {
        resolved['Server 2'] = `${href}_1${currentMinute}`;
      }
    }
    // Server 3 (HubCloud)
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

async function resolveRedirectsForServers(servers) {
  const result = { ...servers };
  if (result['Server 3']) {
    const directLink = await traceHubCloudRedirect(result['Server 3']);
    if (directLink) {
      result['Server 3'] = directLink;
    }
  }
  return result;
}

async function traceHubCloudRedirect(initialUrl) {
  let currentUrl = initialUrl;
  let hops = 0;

  while (hops < 10) {
    const urlObj = new URL(currentUrl);
    if (urlObj.searchParams.has('link')) {
      return urlObj.searchParams.get('link');
    }

    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).toString();
        hops++;
        continue;
      }
    }

    const body = await response.text();
    const jsLocMatch = body.match(/window\.location\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    const jsLocHrefMatch = body.match(/window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    const metaRefreshMatch = body.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']\d+;\s*url=([^"']+)["']/i);

    if (jsLocMatch && !jsLocMatch[1].includes('bonuscaf.com') && !jsLocMatch[1].includes('go/')) {
      currentUrl = jsLocMatch[1];
      hops++;
    } else if (jsLocHrefMatch && !jsLocHrefMatch[1].includes('bonuscaf.com') && !jsLocHrefMatch[1].includes('go/')) {
      currentUrl = jsLocHrefMatch[1];
      hops++;
    } else if (metaRefreshMatch) {
      currentUrl = metaRefreshMatch[1];
      hops++;
    } else {
      break;
    }
  }

  try {
    const finalUrlObj = new URL(currentUrl);
    if (finalUrlObj.searchParams.has('link')) {
      return finalUrlObj.searchParams.get('link');
    }
  } catch (e) {}

  return null;
}
