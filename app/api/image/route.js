import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');
    const width = searchParams.get('w') || '300';

    if (!imageUrl) {
      return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    let finalUrl = imageUrl;
    if (!imageUrl.includes('imdb') && !imageUrl.endsWith('.svg')) {
      finalUrl = `${imageUrl}?x-oss-process=image/resize%2Cw_${width}`;
    }

    const res = await fetch(finalUrl, {
      headers: { 'Referer': 'https://videodownloader.site/' },
    });

    if (!res.ok) {
      return new NextResponse('Image fetch failed', { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
