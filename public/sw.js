const CACHE_NAME = 'daniewatch-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.json',
        '/logo.png',
        '/icon-192.png',
        '/icon-512.png'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

async function handleStreamDownload(request, urlObj) {
  try {
    const videoUrl = urlObj.searchParams.get('url');
    const title = urlObj.searchParams.get('title') || 'video';
    const resolution = urlObj.searchParams.get('res') || '720p';
    const se = urlObj.searchParams.get('se');
    const ep = urlObj.searchParams.get('ep');

    if (!videoUrl) {
      return new Response('url required', { status: 400 });
    }

    const clientRange = request.headers.get('range');
    const headers = new Headers();
    if (clientRange) {
      headers.set('Range', clientRange);
    }
    headers.set('Referer', 'https://videodownloader.site/');

    const res = await fetch(videoUrl, {
      method: 'GET',
      headers
    });

    if (!res.ok && res.status !== 206) {
      return fetch(request);
    }

    const contentType = res.headers.get('content-type') || 'video/mp4';
    const contentLength = res.headers.get('content-length');
    const contentRange = res.headers.get('content-range');
    
    let ext = 'mp4';
    const urlMatch = videoUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
    if (urlMatch) {
      const urlExt = urlMatch[1].toLowerCase();
      if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'm3u8', 'srt', 'vtt', 'json', 'txt'].includes(urlExt)) {
        ext = urlExt;
      }
    } else {
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

    const cleanTitle = title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
    let parts = [];
    parts.push(cleanTitle || 'video');
    
    if (se && se !== '0') {
      const sStr = `S${String(se).padStart(2, '0')}`;
      const eStr = `E${String(ep || 1).padStart(2, '0')}`;
      parts.push(sStr, eStr);
    }
    
    let resStr = resolution;
    if (/^\d+$/.test(resolution)) {
      resStr = `${resolution}p`;
    }
    parts.push(resStr);
    parts.push('DanieWatch');
    
    const filename = `${parts.join('_').replace(/[\s_]+/g, '_')}.${ext}`;

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
    responseHeaders.set('Accept-Ranges', 'bytes');

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders
    });
  } catch (err) {
    return fetch(request);
  }
}

self.addEventListener('fetch', (event) => {
  const urlObj = new URL(event.request.url);
  if (urlObj.pathname === '/api/stream') {
    event.respondWith(handleStreamDownload(event.request, urlObj));
    return;
  }

  if (event.request.url.startsWith('http')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});
