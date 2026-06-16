import { NextResponse } from 'next/server';
import { getBaseHeaders } from '@/lib/token';
import { fetchFreshCatalog } from '@/lib/catalog';
import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = '5aede832ef2f3da08ee4fc5d4aab13c7';

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

// Format the post title with the language priority rules
function formatTitleWithLanguage(title, languagesArray) {
  if (!languagesArray || !Array.isArray(languagesArray) || languagesArray.length === 0) {
    return title;
  }

  // Find priority language
  let langTag = '';
  const hasPunjabi = languagesArray.some(l => /punjabi/i.test(l));
  const hasHindi = languagesArray.some(l => /hindi/i.test(l));
  const hasEnglish = languagesArray.some(l => /english/i.test(l));

  if (hasPunjabi) {
    langTag = 'Punjabi';
  } else if (hasHindi) {
    langTag = 'Hindi';
  } else if (hasEnglish) {
    langTag = 'English';
  } else {
    // Filter out quality tags from the base language list
    const basicLangs = languagesArray.filter(l => !/cam|hdtc|tc|ts|telesync|telecine|result/i.test(l));
    langTag = basicLangs.length > 0 ? basicLangs[0] : ''; // take first non-quality language
  }

  // Check for quality/Cam tags
  let qualityTag = '';
  const camMatch = languagesArray.some(l => /cam|ts|telesync/i.test(l)) || /cam|ts|telesync/i.test(title);
  const hdtcMatch = languagesArray.some(l => /hdtc|tc|telecine/i.test(l)) || /hdtc|tc|telecine/i.test(title);
  
  if (camMatch) {
    qualityTag = 'CAM';
  } else if (hdtcMatch) {
    qualityTag = 'HDTC';
  }

  // Build tag
  let tagParts = [];
  if (langTag) tagParts.push(langTag);
  if (qualityTag) tagParts.push(qualityTag);

  if (tagParts.length > 0) {
    return `${title} [${tagParts.join(' - ')}]`;
  }
  return title;
}

async function resolveTitleFromId(id) {
  const cleanId = id.trim();
  try {
    if (/^tt\d+$/.test(cleanId)) {
      // IMDb ID
      const res = await fetch(`https://api.themoviedb.org/3/find/${cleanId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
      const data = await res.json();
      const movie = data?.movie_results?.[0];
      const tv = data?.tv_results?.[0];
      if (movie) return { title: movie.title, type: 'movie' };
      if (tv) return { title: tv.name, type: 'tv' };
    } else if (/^\d{5,8}$/.test(cleanId)) {
      // TMDB ID
      // Try movie
      const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${cleanId}?api_key=${TMDB_API_KEY}`);
      const movieData = await movieRes.json();
      if (movieData && movieData.title) {
        return { title: movieData.title, type: 'movie' };
      }
      // Try TV
      const tvRes = await fetch(`https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}`);
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
    const directMatch = indexData.find(
      item => String(item[0]) === cleanKeyword || String(item[2]) === cleanKeyword
    );

    let searchKeyword = cleanKeyword;
    if (directMatch) {
      searchKeyword = directMatch[1];
    } else if (/^(tt\d+|\d{5,8})$/.test(cleanKeyword)) {
      const resolved = await resolveTitleFromId(cleanKeyword);
      if (resolved) {
        searchKeyword = resolved.title;
      }
    }

    // 2. SEARCH THE GITHUB CATALOG INDEX FIRST (ONLY ON FIRST PAGE OF SEARCH RESULTS)
    const githubMatches = [];
    if (page === 1 && searchKeyword.length >= 2) {
      try {
        const catalog = await fetchFreshCatalog();
        const queryClean = cleanText(searchKeyword);
        const matchedCatalogItems = catalog.filter(item => {
          return cleanText(item.title).includes(queryClean);
        });

        // Resolve details for the catalog matches from TMDB in parallel
        const matchPromises = matchedCatalogItems.slice(0, 5).map(async (match) => {
          const tmdbId = match.id;
          const mediaType = match.mediaType === 'series' ? 'tv' : 'movie';
          let coverUrl = '';
          let rating = '';
          let description = '';
          let genres = '';
          let countryName = '';

          try {
            const tmdbRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`);
            if (tmdbRes.ok) {
              const tmdbData = await tmdbRes.json();
              if (tmdbData.poster_path) {
                coverUrl = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
              }
              rating = tmdbData.vote_average ? String(tmdbData.vote_average.toFixed(1)) : '';
              description = tmdbData.overview || '';
              genres = (tmdbData.genres || []).map(g => g.name).join(', ');
              countryName = (tmdbData.production_countries || []).map(c => c.name).join(', ') || (tmdbData.origin_country || []).join(', ');
            }
          } catch (e) {
            console.error(`Error fetching TMDB details for match ${tmdbId}:`, e);
          }

          const formattedTitle = formatTitleWithLanguage(match.title, match.languages);

          return {
            subjectId: `github_${match.mediaType}_${tmdbId}`,
            title: formattedTitle,
            subjectType: match.mediaType === 'series' ? 2 : 1,
            cover: coverUrl ? { url: coverUrl } : null,
            imdbRatingValue: rating,
            releaseDate: match.releaseDate || '',
            genre: genres || match.genres.join(', '),
            description: description,
            countryName: countryName || match.originCountry.join(', '),
            detailPath: `github_${match.mediaType}_${tmdbId}`,
            fromGithubCatalog: true
          };
        });

        const resolvedMatches = await Promise.all(matchPromises);
        githubMatches.push(...resolvedMatches.filter(Boolean));
      } catch (err) {
        console.error('Error matching GitHub catalog index:', err);
      }
    }

    // 3. Fetch results from AoneRoom API
    const clientIp = request.headers.get('x-forwarded-for') || '';
    const acceptLanguage = request.headers.get('accept-language') || '';

    const headers = {
      ...getBaseHeaders(),
      'X-Source': 'downloader',
    };
    if (clientIp) {
      headers['X-Forwarded-For'] = clientIp;
    }
    if (acceptLanguage) {
      headers['Accept-Language'] = acceptLanguage;
    }

    const hasHindiWord = /hindi/i.test(searchKeyword);
    const hasPunjabiWord = /punjabi/i.test(searchKeyword);
    const fetchPromises = [
      fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ keyword: searchKeyword, page, perPage, subjectType }),
      })
    ];

    if (!hasPunjabiWord) {
      fetchPromises.push(
        fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
          method: 'POST',
          headers,
          body: JSON.stringify({ keyword: `${searchKeyword} Punjabi`, page, perPage, subjectType }),
        })
      );
    }

    if (!hasHindiWord) {
      fetchPromises.push(
        fetch('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
          method: 'POST',
          headers,
          body: JSON.stringify({ keyword: `${searchKeyword} Hindi`, page, perPage, subjectType }),
        })
      );
    }

    const responses = await Promise.all(fetchPromises);
    const dataObjects = [];
    for (const res of responses) {
      try {
        const json = await res.json();
        dataObjects.push(json);
      } catch (err) {
        console.error('Error parsing AoneRoom search response:', err);
        dataObjects.push(null);
      }
    }

    const primaryData = dataObjects[0];
    if (!primaryData || primaryData.code !== 0) {
      throw new Error(primaryData?.message || 'Search failed');
    }

    let originalItems = primaryData.data?.items || [];
    const seenIds = new Set(originalItems.map(item => String(item.subjectId)));

    // Merge secondary (Punjabi & Hindi) search results
    for (let idx = 1; idx < dataObjects.length; idx++) {
      const secondaryData = dataObjects[idx];
      if (secondaryData && secondaryData.code === 0) {
        const secondaryItems = secondaryData.data?.items || [];
        for (const item of secondaryItems) {
          if (!seenIds.has(String(item.subjectId))) {
            originalItems.push(item);
            seenIds.add(String(item.subjectId));
          }
        }
      }
    }

    // Filter items by whitelist (if showIndexOnly is true)
    let filteredItems = originalItems;
    if (showIndexOnly) {
      if (directMatch) {
        filteredItems = originalItems.filter(
          item => String(item.subjectId) === String(directMatch[3])
        );
      } else {
        const whitelistedSubjectIds = new Set(indexData.map(item => String(item[3])));
        filteredItems = originalItems.filter(
          item => whitelistedSubjectIds.has(String(item.subjectId))
        );
      }
    }

    // Sort original AoneRoom items with Punjabi prioritized first, then Hindi
    const cleanSearchKeyword = cleanText(searchKeyword);
    const sortedItems = [...filteredItems].sort((a, b) => {
      const getWeight = (item) => {
        if (!item || !item.title) return 0;
        const isExact = cleanText(item.title) === cleanSearchKeyword;
        const hasPunjabi = /\[\s*punjabi\s*\]/i.test(item.title) || /\bpunjabi\b/i.test(item.title);
        const hasHindi = /\[\s*hindi\s*\]/i.test(item.title) || /\bhindi\b/i.test(item.title);
        
        if (isExact && hasPunjabi) return 5;
        if (isExact && hasHindi) return 4;
        if (isExact) return 3;
        if (hasPunjabi) return 2;
        if (hasHindi) return 1;
        return 0;
      };
      return getWeight(b) - getWeight(a);
    });

    // 4. MERGE GITHUB INDEX MATCHES FIRST, THEN DEDUPLICATE AND APPEND THE OTHERS
    let finalItems = [...githubMatches];
    const seenSubjectIds = new Set(githubMatches.map(m => String(m.subjectId)));

    for (const item of sortedItems) {
      const idStr = String(item.subjectId);
      if (!seenSubjectIds.has(idStr)) {
        finalItems.push(item);
        seenSubjectIds.add(idStr);
      }
    }

    if (primaryData.data) {
      primaryData.data.items = finalItems;
      if (primaryData.data.pager) {
        primaryData.data.pager.totalCount = showIndexOnly ? finalItems.length : primaryData.data.pager.totalCount + githubMatches.length;
        if (showIndexOnly) {
          primaryData.data.pager.hasMore = false;
        }
      }
    }

    return NextResponse.json(primaryData);
  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}
