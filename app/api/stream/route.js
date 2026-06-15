import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');
    const title = searchParams.get('title') || 'video';
    const resolution = searchParams.get('res') || '720p';
    const se = searchParams.get('se');
    const ep = searchParams.get('ep');

    if (!videoUrl) {
      return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    const res = await fetch(videoUrl, {
      method: 'GET',
      headers: {
        'Referer': 'https://videodownloader.site/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      return new NextResponse(`CDN fetch failed: ${res.statusText}`, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'video/mp4';
    const contentLength = res.headers.get('content-length');
    
    // Detect file extension based on contentType or URL path
    let ext = 'mp4';
    if (contentType.includes('subrip') || videoUrl.includes('.srt')) {
      ext = 'srt';
    } else if (contentType.includes('vtt') || videoUrl.includes('.vtt')) {
      ext = 'vtt';
    } else if (contentType.includes('json') || videoUrl.includes('.json')) {
      ext = 'json';
    }
    
    // Clean up filename and format as required
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

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);

    return new NextResponse(res.body, { headers });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
