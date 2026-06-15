import { NextResponse } from 'next/server';
import { getBaseHeaders } from '@/lib/token';

export async function POST(request) {
  try {
    const body = await request.json();
    const { keyword, perPage = 10 } = body;

    const res = await fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search-suggest', {
      method: 'POST',
      headers: getBaseHeaders(),
      body: JSON.stringify({ keyword, perPage }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}
