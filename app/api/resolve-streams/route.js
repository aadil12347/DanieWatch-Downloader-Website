import { NextResponse } from 'next/server';
import { getStreamingJsonUrl, fetchStreamLinksMap, parseVcloudLayout, getResolutionsWithSize } from '@/lib/stream-resolver';

// Edge runtime gives 30-second timeout (vs 10s Node.js on Vercel Hobby)
// Needed because getResolutionsWithSize fetches VCloud pages via Scrape.do
export const runtime = 'edge';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbId = Number(searchParams.get('tmdbId'));
    const mediaType = searchParams.get('mediaType') === 'series' ? 'series' : 'movie';
    const title = searchParams.get('title') || '';
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : null;
    const imdb = searchParams.get('imdb') || null;
    const season = searchParams.get('season') ? Number(searchParams.get('season')) : undefined;
    const episode = searchParams.get('episode') ? Number(searchParams.get('episode')) : undefined;
    const layoutRequested = searchParams.get('layout') === 'true';

    if (!tmdbId || !title) {
      return NextResponse.json({ error: 'tmdbId and title are required' }, { status: 400 });
    }

    console.log(`[resolve-streams] Looking up: tmdbId=${tmdbId}, mediaType=${mediaType}, title="${title}", year=${year}, imdb=${imdb}, season=${season}`);
    
    const jsonUrl = await getStreamingJsonUrl(tmdbId, mediaType, title, year, imdb, season);
    console.log(`[resolve-streams] Result URL: ${jsonUrl || 'NULL'}`);
    
    if (!jsonUrl) {
      return NextResponse.json({ success: false, error: 'Could not resolve streaming file path' });
    }

    // If layout is requested, parse the structure and return the seasons/episodes/resolutions mapping
    if (layoutRequested) {
      const layoutData = await parseVcloudLayout(jsonUrl, mediaType);
      if (!layoutData) {
        return NextResponse.json({ success: false, error: 'Failed to parse VCloud database layout' });
      }
      return NextResponse.json({ success: true, ...layoutData });
    }

    // Default: return resolutions for the selected season and episode
    const resolutionsMap = await fetchStreamLinksMap(jsonUrl, mediaType, season, episode);
    const resolutions = await getResolutionsWithSize(resolutionsMap);
    
    return NextResponse.json({ success: true, resolutions });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
