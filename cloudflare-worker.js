/**
 * Cloudflare Worker Proxy for DanieWatch Downloader
 * 
 * Features:
 * 1. Bypasses Cloudflare Turnstile blocks on datacenter IPs (like Vercel) by fetching through Cloudflare's edge network.
 * 2. Streams large video files (GBs) without size/timeout limits, completely offloading bandwidth from Vercel.
 * 3. Supports HTTP Range requests (crucial for video players and download resuming).
 * 4. Adds appropriate Referer and User-Agent headers to pass CDN hotlink protections.
 * 5. Automatically forces file download popup with descriptive naming (e.g., Movie_Title_S01E01_1080p_DanieWatch.mp4).
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
  const urlObj = new URL(request.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing target "url" parameter. Usage: https://your-worker.workers.dev/?url=HTTPS_URL_HERE', { 
      status: 400,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // Handle CORS preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  try {
    const headers = new Headers();
    
    // Copy incoming client Range headers if present
    const range = request.headers.get('range');
    if (range) {
      headers.set('Range', range);
    }
    
    // Set realistic browser User-Agent
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set Referer headers for hotlink protection bypass
    const targetUrlLower = targetUrl.toLowerCase();
    if (targetUrlLower.includes('vcloud.zip') || targetUrlLower.includes('hubcloud') || targetUrlLower.includes('gpdl')) {
      headers.set('Referer', 'https://vcloud.zip/');
    } else {
      headers.set('Referer', 'https://videodownloader.site/');
    }

    // Fetch the target URL from the edge
    const response = await fetch(targetUrl, {
      method: request.method === 'POST' ? 'POST' : 'GET',
      headers: headers,
      redirect: 'follow'
    });

    // Copy all response headers
    const newHeaders = new Headers(response.headers);
    
    // Inject CORS headers so client-side fetching works
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    
    // If filename metadata query params exist, construct the Content-Disposition attachment header
    const title = urlObj.searchParams.get('title');
    const resName = urlObj.searchParams.get('res') || urlObj.searchParams.get('resolution');
    const se = urlObj.searchParams.get('se');
    const ep = urlObj.searchParams.get('ep');

    if (title) {
      // Guess file extension from URL
      let ext = 'mp4';
      const extMatch = targetUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
      if (extMatch) {
        const matchedExt = extMatch[1].toLowerCase();
        if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'srt', 'vtt', 'json'].includes(matchedExt)) {
          ext = matchedExt;
        }
      } else {
        // Fallback guess from content-type header
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('matroska') || contentType.includes('mkv')) ext = 'mkv';
        else if (contentType.includes('webm')) ext = 'webm';
        else if (contentType.includes('subrip') || contentType.includes('srt')) ext = 'srt';
        else if (contentType.includes('vtt')) ext = 'vtt';
      }

      // Format filename nicely: Title_S01E02_1080p_DanieWatch.mp4
      const cleanTitle = title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
      const parts = [cleanTitle];
      
      if (se && se !== '0') {
        const sStr = `S${String(se).padStart(2, '0')}`;
        const eStr = `E${String(ep || 1).padStart(2, '0')}`;
        parts.push(`${sStr}${eStr}`);
      }
      
      if (resName) {
        let cleanRes = resName;
        if (/^\d+$/.test(resName)) cleanRes = `${resName}p`;
        parts.push(cleanRes);
      }
      
      parts.push('DanieWatch');
      const filename = parts.join('_').replace(/[\s_]+/g, '_') + '.' + ext;
      newHeaders.set('Content-Disposition', `attachment; filename="${filename}"`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (err) {
    return new Response(`Cloudflare Worker Proxy Error: ${err.message}`, { 
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
