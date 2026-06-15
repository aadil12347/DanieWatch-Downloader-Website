import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = '5aede832ef2f3da08ee4fc5d4aab13c7';

function cleanText(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // remove brackets like [Hindi]
    .replace(/\([^)]*\)/g, '') // remove parens like (2022)
    .replace(/\bs\d+(-s\d+)?\b/gi, '') // remove S1-S5, S1
    .replace(/\bseason\s*\d+\b/gi, '') // remove Season 1
    .replace(/\b(dubbed|subbed|multi|dual\s*audio|hindi|english|telugu|tamil|eng|dub|sub)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFormattedDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function POST(request) {
  try {
    const { title, type, subjectId, detailPath, tmdbId: passedTmdbId } = await request.json();

    if (!title) {
      return NextResponse.json({ code: 400, message: 'Title is required' }, { status: 400 });
    }

    const isTv = type?.toLowerCase() === 'tv';
    const mediaType = isTv ? 'tv' : 'movie';
    const query = cleanText(title);

    let tmdbId = passedTmdbId;

    // 1. Search TMDB if ID wasn't passed directly
    if (!tmdbId) {
      const searchUrl = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      const results = searchData?.results || [];
      if (results.length === 0) {
        return NextResponse.json({ code: 404, message: `Could not find this title on TMDB` }, { status: 404 });
      }
      tmdbId = results[0].id;
    }

    // 2. Fetch TMDB Details
    const detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const details = await detailsRes.json();

    if (!details || details.status_code === 34) {
      return NextResponse.json({ code: 404, message: `Could not fetch TMDB details for ID ${tmdbId}` }, { status: 404 });
    }

    // 3. Resolve IMDb ID
    let imdbId = '';
    if (!isTv) {
      imdbId = details.imdb_id || '';
    } else {
      const extUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
      const extRes = await fetch(extUrl);
      const extData = await extRes.json();
      imdbId = extData?.imdb_id || '';
    }

    const tmdbTitle = isTv ? details.name : details.title;

    // 4. Construct Whitelist entry array
    // Format: [tmdbId, title, imdbId, subjectId, detailPath]
    const newEntry = [
      Number(tmdbId),
      tmdbTitle,
      imdbId,
      subjectId || '',
      detailPath || ''
    ];

    // 6. Write to index.json (prevent duplicates)
    const filePath = path.join(process.cwd(), 'lib', 'index.json');
    let indexData = [];
    if (fs.existsSync(filePath)) {
      try {
        indexData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        indexData = [];
      }
    }

    // Check if item already exists by TMDB ID, IMDb ID, or subject ID
    const duplicateIndex = indexData.findIndex(item => {
      if (tmdbId && item[0] && Number(item[0]) === Number(tmdbId)) return true;
      if (imdbId && item[2] && item[2] === imdbId) return true;
      if (subjectId && item[3] && String(item[3]) === String(subjectId)) return true;
      return false;
    });

    if (duplicateIndex !== -1) {
      // Update existing entry
      indexData[duplicateIndex] = newEntry;
    } else {
      // Add new entry
      indexData.push(newEntry);
    }

    // Deduplicate any exact duplicate rows just to be absolutely safe
    const uniqueIndexData = [];
    const seen = new Set();
    for (const item of indexData) {
      const key = `${item[0]}-${item[2]}-${item[3]}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueIndexData.push(item);
      }
    }

    // Format array-of-arrays as single line rows
    const rows = uniqueIndexData.map(entry => JSON.stringify(entry)).join(',\n  ');
    const finalContent = `[\n  ${rows}\n]\n`;

    fs.writeFileSync(filePath, finalContent, 'utf8');

    return NextResponse.json({
      code: 0,
      message: duplicateIndex !== -1 ? 'Updated in index.json' : 'Added to index.json',
      entry: newEntry
    });

  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'lib', 'index.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json([]);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const indexData = JSON.parse(content);
    return NextResponse.json(indexData);
  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { subjectId } = await request.json();
    if (!subjectId) {
      return NextResponse.json({ code: 400, message: 'subjectId is required' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'lib', 'index.json');
    let indexData = [];
    if (fs.existsSync(filePath)) {
      try {
        indexData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        indexData = [];
      }
    }

    // Filter out item with the matching subject ID
    const newIndexData = indexData.filter(item => String(item[3]) !== String(subjectId));

    // Format array-of-arrays as single line rows
    const rows = newIndexData.map(entry => JSON.stringify(entry)).join(',\n  ');
    const finalContent = `[\n  ${rows}\n]\n`;

    fs.writeFileSync(filePath, finalContent, 'utf8');

    return NextResponse.json({ code: 0, message: 'Removed from index.json' });
  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}
