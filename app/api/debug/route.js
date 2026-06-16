import { NextResponse } from 'next/server';

function getFetchUrl(url) {
  const proxyUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL;
  if (proxyUrl && proxyUrl.startsWith('http') && !proxyUrl.includes('your-subdomain')) {
    return `${proxyUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function GET(request) {
  const proxyUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL || 'Not defined';
  
  // Test URLs
  const urls = [
    'https://vcloud.zip/9lfynnlmnwqggn9',
    'https://vcloud.zip/re6qhhnhiandauo',
    'https://vcloud.zip/1s_sj7sgjsusghs'
  ];
  
  const results = [];
  for (const url of urls) {
    const targetFetchUrl = getFetchUrl(url);
    try {
      const res = await fetch(targetFetchUrl, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        cache: 'no-store'
      });
      const text = await res.text();
      const sizeMatch = text.match(/id=["']size["']>([^<]+)<\/i>/i);
      results.push({
        url,
        targetFetchUrl,
        status: res.status,
        sizeFound: !!sizeMatch,
        sizeValue: sizeMatch ? sizeMatch[1] : null,
        title: text.match(/<title>([^<]+)<\/title>/i)?.[1] || 'No Title',
        textLength: text.length
      });
    } catch (e) {
      results.push({
        url,
        error: e.message
      });
    }
  }
  
  return NextResponse.json({
    proxyUrl,
    results
  });
}
