import { NextResponse } from 'next/server';
import { getBaseHeaders } from '@/lib/token';

const TMDB_API_KEY = '5aede832ef2f3da08ee4fc5d4aab13c7';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const detailPath = searchParams.get('detailPath');

    if (!detailPath) {
      return NextResponse.json({ code: 400, message: 'detailPath required' }, { status: 400 });
    }

    // Check if the detail path points to a GitHub database item
    if (detailPath.startsWith('github_')) {
      const parts = detailPath.split('_');
      const mediaTypeRaw = parts[1];
      const tmdbId = parts[2];
      
      if (!tmdbId) {
        return NextResponse.json({ code: 400, message: 'Invalid GitHub TMDB ID' }, { status: 400 });
      }

      const isTv = mediaTypeRaw === 'series' || mediaTypeRaw === 'tv';
      const tmdbPath = isTv ? 'tv' : 'movie';
      
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/${tmdbPath}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      
      if (!tmdbRes.ok) {
        return NextResponse.json({ code: 404, message: 'Title not found on TMDB' }, { status: 404 });
      }
      
      const tmdbData = await tmdbRes.json();

      // Construct a response formatted exactly like AoneRoom BFF response
      const title = isTv ? tmdbData.name : tmdbData.title;
      const releaseDate = isTv ? tmdbData.first_air_date : tmdbData.release_date;
      const rating = tmdbData.vote_average ? String(tmdbData.vote_average.toFixed(1)) : '';
      const coverUrl = tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : '';
      const backdropUrl = tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : '';
      const genres = (tmdbData.genres || []).map(g => g.name).join(', ');
      const country = (tmdbData.production_countries || []).map(c => c.name).join(', ') || (tmdbData.origin_country || []).join(', ');

      const formattedDetail = {
        code: 0,
        message: 'ok',
        data: {
          subject: {
            title,
            description: tmdbData.overview || '',
            cover: { url: coverUrl },
            stills: backdropUrl ? [{ url: backdropUrl }] : [],
            hasResource: true,
            imdbRatingValue: rating,
            releaseDate: releaseDate || '',
            countryName: country,
            genre: genres,
            subjectId: tmdbId
          },
          resource: {
            seasons: isTv
              ? (tmdbData.seasons || [])
                  .filter(s => s.season_number > 0)
                  .map(s => ({
                    se: s.season_number,
                    maxEp: s.episode_count
                  }))
              : []
          }
        }
      };

      return NextResponse.json(formattedDetail);
    }

    // Default: Fetch from AoneRoom API
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
