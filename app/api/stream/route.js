import { NextResponse } from 'next/server';
import { cleanTitleForFilename, detectLanguage } from '@/lib/naming-helper';

export const runtime = 'edge';

// Paste your Cloudflare Worker URL here after deploying it, or configure it in your environment variables.
const CLOUDFLARE_WORKER_PROXY_URL = process.env.CLOUDFLARE_WORKER_PROXY_URL || 'https://danie-watch-proxy.your-subdomain.workers.dev';

function getRawVideoUrl(reqUrl) {
  try {
    const urlObj = new URL(reqUrl);
    const searchStr = urlObj.search;
    const match = searchStr.match(/[?&]url=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return urlObj.searchParams.get('url');
  } catch (e) {
    return null;
  }
}

export async function GET(request) {
  try {
    const videoUrl = getRawVideoUrl(request.url);
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || 'video';
    const resolution = searchParams.get('res') || '720p';
    const se = searchParams.get('se');
    const ep = searchParams.get('ep');
    const langParam = searchParams.get('lang');

    if (!videoUrl) {
      return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    // 1. If Cloudflare Worker is configured (not the placeholder), redirect to it
    if (CLOUDFLARE_WORKER_PROXY_URL && !CLOUDFLARE_WORKER_PROXY_URL.includes('your-subdomain')) {
      const workerUrl = new URL(CLOUDFLARE_WORKER_PROXY_URL);
      searchParams.forEach((value, key) => {
        workerUrl.searchParams.set(key, value);
      });
      return NextResponse.redirect(workerUrl.toString(), 307);
    }

    // 2. Otherwise, fall back to local proxy streaming (useful for localhost testing without Cloudflare worker setup)
    // Detect file extension based on URL path first
    let ext = 'mp4';
    const urlMatch = videoUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
    if (urlMatch) {
      const urlExt = urlMatch[1].toLowerCase();
      if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'm3u8', 'srt', 'vtt', 'json', 'txt'].includes(urlExt)) {
        ext = urlExt;
      }
    }

    // Clean up filename and format as required
    const cleanTitle = cleanTitleForFilename(title) || 'video';
    const detectedLang = langParam || detectLanguage(title);
    
    let parts = [];
    parts.push(cleanTitle);
    
    const isMovie = !se || se === '0';
    if (isMovie) {
      const yearParam = searchParams.get('year');
      let movieYear = yearParam;
      if (!movieYear) {
        // Fallback: extract 4-digit year from original title
        const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
        if (yearMatch) {
          movieYear = yearMatch[1];
        }
      }
      if (movieYear && !cleanTitle.includes(movieYear)) {
        parts.push(movieYear);
      }
    } else {
      const sStr = `S${String(se).padStart(2, '0')}`;
      const eStr = `E${String(ep || 1).padStart(2, '0')}`;
      parts.push(`${sStr} ${eStr}`);
    }
    
    let resStr = resolution;
    if (/^\d+$/.test(resolution)) {
      resStr = `${resolution}p`;
    }
    parts.push(resStr);
    parts.push(detectedLang);
    parts.push('DanieWatch');
    
    const baseFilename = parts.join(' ').replace(/\s+/g, ' ');

    // Forward the client Range header if present
    const clientRange = request.headers.get('range');
    const headers = new Headers();
    headers.set('Referer', 'https://videodownloader.site/');
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    if (clientRange) {
      headers.set('Range', clientRange);
    }

    const res = await fetch(videoUrl, {
      method: 'GET',
      headers
    });

    // 206 Partial Content is valid for range streams
    if (!res.ok && res.status !== 206) {
      console.warn(`CDN fetch failed with status ${res.status}: ${res.statusText}. Redirecting directly to: ${videoUrl}`);
      const redirectHeaders = new Headers();
      redirectHeaders.set('Location', videoUrl);
      redirectHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      redirectHeaders.set('Referrer-Policy', 'no-referrer');
      redirectHeaders.set('Content-Disposition', `attachment; filename="${baseFilename}.${ext}"`);
      return new NextResponse(null, { status: 307, headers: redirectHeaders });
    }

    const contentType = res.headers.get('content-type') || 'video/mp4';
    const contentLength = res.headers.get('content-length');
    const contentRange = res.headers.get('content-range');
    
    // Refine extension based on content-type if not already matched from URL
    if (!urlMatch) {
      if (contentType.includes('subrip') || contentType.includes('srt')) {
        ext = 'srt';
      } else if (contentType.includes('vtt')) {
        ext = 'vtt';
      } else if (contentType.includes('json')) {
        ext = 'json';
      } else if (contentType.includes('x-matroska') || contentType.includes('mkv')) {
        ext = 'mkv';
      } else if (contentType.includes('webm')) {
        ext = 'webm';
      }
    }
    
    const filename = `${baseFilename}.${ext}`;

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }
    responseHeaders.set('Content-Disposition', `attachment; filename="${filename}"`);
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return new NextResponse(res.body, { 
      status: res.status,
      headers: responseHeaders 
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
