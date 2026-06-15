import { NextResponse } from 'next/server';
import { getBaseHeaders } from '@/lib/token';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const detailPath = searchParams.get('detailPath');

    if (!detailPath) {
      return NextResponse.json({ code: 400, message: 'detailPath required' }, { status: 400 });
    }

    const res = await fetch(
      `https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(detailPath)}`,
      { method: 'GET', headers: getBaseHeaders() }
    );

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}
