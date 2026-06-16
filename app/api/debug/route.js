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
  const isPlaceholder = proxyUrl.includes('your-subdomain');
  
  const testUrl = 'https://vcloud.zip/3699fyu95ym3ma6';
  const targetFetchUrl = getFetchUrl(testUrl);
  
  let fetchResult = {};
  try {
    const t0 = Date.now();
    const res = await fetch(targetFetchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      cache: 'no-store'
    });
    const t1 = Date.now();
    const text = await res.text();
    const sizeMatch = text.match(/id=["']size["']>([^<]+)<\/i>/i);
    
    fetchResult = {
      success: true,
      status: res.status,
      timeMs: t1 - t0,
      sizeFound: !!sizeMatch,
      sizeValue: sizeMatch ? sizeMatch[1] : null,
      htmlSnippet: text.slice(0, 500),
      isCloudflareChallenge: text.includes('Just a moment...') || text.includes('cloudflare') || text.includes('turnstile')
    };
  } catch (err) {
    fetchResult = {
      success: false,
      error: err.message
    };
  }
  
  return NextResponse.json({
    proxyUrl,
    isPlaceholder,
    targetFetchUrl,
    fetchResult
  });
}
