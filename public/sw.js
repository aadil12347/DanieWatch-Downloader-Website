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

    const cleanTitle = cleanTitleForFilename(title) || 'video';
    const langParam = urlObj.searchParams.get('lang');
    const detectedLang = langParam || detectLanguage(title);
    let parts = [];
    parts.push(cleanTitle);
    
    const isMovie = !se || se === '0';
    if (isMovie) {
      const yearParam = urlObj.searchParams.get('year');
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
    
    const filename = `${parts.join(' ').replace(/\s+/g, ' ')}.${ext}`;

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

function cleanTitleForFilename(title) {
  if (!title) return '';
  let clean = title;
  
  // Remove leading "Download " or "Download"
  clean = clean.replace(/^download\s+/i, '');
  
  // Remove everything in brackets [] or braces {} or parentheses ()
  clean = clean.replace(/\[[^\]]*\]/g, '')
               .replace(/\{[^}]*\}/g, '')
               .replace(/\([^)]*\)/g, '');
    
  // Remove common keywords
  clean = clean.replace(/\b(dual\s+audio|multi\s+audio|dubbed|subbed|hindi|english|punjabi|tamil|telugu|kannada|malayalam|bengali|marathi|urdu|gujarati|japanese|korean|chinese|spanish|french|german|bluray|web-dl|webdl|hdtc|cam|ts|telesync|hdts|rip|org|original|4k-sdr|uhd|sdr|amazon\s+film|amazon\s+original|netflix\s+original|netflix|prime\s+video)\b/gi, '');
  
  // Remove season/episode info
  clean = clean.replace(/\bs\d+e\d+\b/gi, '')
               .replace(/\bs\d+\b/gi, '')
               .replace(/\be\d+\b/gi, '')
               .replace(/\bseason\s*\d+\b/gi, '')
               .replace(/\bepisode\s*\d+\b/gi, '')
               .replace(/\b(s\d+\s+e\d+|s\d+\s+episode\s+\d+)\b/gi, '');
                
  // Remove quality tags
  clean = clean.replace(/\b(480p|720p|1080p|2160p)\b/gi, '');
  
  // Remove video codecs / encodings / properties
  clean = clean.replace(/\b(x264|h264|x265|hevc|10bit|10-bit|10\s*bit|dds5\.1|dd5\.1|dd2\.0|ddp5\.1|hqc|hq|aac)\b/gi, '');
  
  // Replace non-alphanumeric with spaces, keep only alphanumeric and spaces
  clean = clean.replace(/[^a-zA-Z0-9\s]/g, ' ');
  
  // Clean multiple spaces
  clean = clean.replace(/\s+/g, ' ');
  
  return clean.trim();
}

function detectLanguage(title) {
  if (!title) return 'Hindi'; // Default fallback
  const titleLower = title.toLowerCase();
  
  // Prioritized list of common languages
  const langs = [
    { name: 'Hindi', regex: /\bhindi\b/i },
    { name: 'Punjabi', regex: /\bpunjabi\b/i },
    { name: 'English', regex: /\b(english|eng)\b/i },
    { name: 'Tamil', regex: /\btamil\b/i },
    { name: 'Telugu', regex: /\btelugu\b/i },
    { name: 'Kannada', regex: /\bkannada\b/i },
    { name: 'Malayalam', regex: /\bmalayalam\b/i },
    { name: 'Bengali', regex: /\bbengali\b/i },
    { name: 'Marathi', regex: /\bmarathi\b/i },
    { name: 'Urdu', regex: /\burdu\b/i },
    { name: 'Japanese', regex: /\b(japanese|jap)\b/i },
    { name: 'Korean', regex: /\b(korean|kor)\b/i },
    { name: 'Chinese', regex: /\bchinese\b/i },
    { name: 'Spanish', regex: /\bspanish\b/i },
    { name: 'French', regex: /\bfrench\b/i },
    { name: 'German', regex: /\bgerman\b/i }
  ];
  
  // First look for curly braces or brackets containing languages
  const matchBraces = title.match(/\{([^}]+)\}/) || title.match(/\[([^\]]+)\]/);
  if (matchBraces) {
    const inside = matchBraces[1].toLowerCase();
    // Check if any lang matches inside braces/brackets first
    for (const lang of langs) {
      if (lang.regex.test(inside)) {
        return lang.name;
      }
    }
  }
  
  // Fallback to checking the whole title
  for (const lang of langs) {
    if (lang.regex.test(titleLower)) {
      return lang.name;
    }
  }
  
  return 'Hindi'; // Default fallback
}
