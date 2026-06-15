import { NextResponse } from 'next/server';
import { getBaseHeaders } from '@/lib/token';
import fs from 'fs';
import path from 'path';

function getIndexData() {
  try {
    const filePath = path.join(process.cwd(), 'lib', 'index.json');
    if (!fs.existsSync(filePath)) return [];
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading index.json:', error);
    return [];
  }
}

function cleanText(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // remove brackets
    .replace(/\([^)]*\)/g, '') // remove parens
    .replace(/\bs\d+(-s\d+)?\b/gi, '') // remove S1-S5, S1
    .replace(/\bseason\s*\d+\b/gi, '') // remove Season 1
    .replace(/\b(dubbed|subbed|multi|dual\s*audio|hindi|english|telugu|tamil|eng|dub|sub)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function resolveTitleFromId(id) {
  const cleanId = id.trim();
  const key = '5aede832ef2f3da08ee4fc5d4aab13c7';
  
  try {
    if (/^tt\d+$/.test(cleanId)) {
      // IMDb ID
      const res = await fetch(`https://api.themoviedb.org/3/find/${cleanId}?api_key=${key}&external_source=imdb_id`);
      const data = await res.json();
      const movie = data?.movie_results?.[0];
      const tv = data?.tv_results?.[0];
      if (movie) return { title: movie.title, type: 'movie' };
      if (tv) return { title: tv.name, type: 'tv' };
    } else if (/^\d{5,8}$/.test(cleanId)) {
      // TMDB ID
      // Try movie
      const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${cleanId}?api_key=${key}`);
      const movieData = await movieRes.json();
      if (movieData && movieData.title) {
        return { title: movieData.title, type: 'movie' };
      }
      // Try TV
      const tvRes = await fetch(`https://api.themoviedb.org/3/tv/${cleanId}?api_key=${key}`);
      const tvData = await tvRes.json();
      if (tvData && tvData.name) {
        return { title: tvData.name, type: 'tv' };
      }
    }
  } catch (e) {
    console.error('Error resolving ID from TMDB:', e);
  }
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { keyword, page = 1, perPage = 15, subjectType = 0, showIndexOnly = false } = body;
    const cleanKeyword = keyword?.trim() || '';

    const indexData = getIndexData();

    // 1. Check if keyword is a whitelisted TMDB/IMDb ID
    // indexData entries map: [tmdbId, title, imdbId, subjectId, detailPath]
    const directMatch = indexData.find(
      item => String(item[0]) === cleanKeyword || String(item[2]) === cleanKeyword
    );

    let searchKeyword = cleanKeyword;
    if (directMatch) {
      // Resolve ID to whitelisted Title
      searchKeyword = directMatch[1];
    } else if (/^(tt\d+|\d{5,8})$/.test(cleanKeyword)) {
      // Not whitelisted, but looks like an ID - resolve from TMDB
      const resolved = await resolveTitleFromId(cleanKeyword);
      if (resolved) {
        searchKeyword = resolved.title;
      }
    }

    // 2. Fetch results from AoneRoom API
    const res = await fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      method: 'POST',
      headers: { ...getBaseHeaders(), 'X-Source': 'downloader' },
      body: JSON.stringify({ keyword: searchKeyword, page, perPage, subjectType }),
    });

    const data = await res.json();
    const originalItems = data?.data?.items || [];

    // 3. Filter items by whitelist (only if showIndexOnly is true)
    let filteredItems = originalItems;
    if (showIndexOnly) {
      if (directMatch) {
        // Return only the exact whitelisted subjectId
        filteredItems = originalItems.filter(
          item => String(item.subjectId) === String(directMatch[3])
        );
      } else {
        // Only show items whose subjectId exists in the whitelist
        const whitelistedSubjectIds = new Set(indexData.map(item => String(item[3])));
        filteredItems = originalItems.filter(
          item => whitelistedSubjectIds.has(String(item.subjectId))
        );
      }
    }

    // Replace items and update total count in response
    if (data.data) {
      data.data.items = filteredItems;
      if (data.data.pager) {
        data.data.pager.totalCount = showIndexOnly ? filteredItems.length : data.data.pager.totalCount;
        if (showIndexOnly) {
          data.data.pager.hasMore = false; // Whitelist filtering breaks remote pagination
        }
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}
