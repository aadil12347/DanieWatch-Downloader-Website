const INDEX_URL = 'https://raw.githubusercontent.com/aadil12347/DanieWatch_Apk_Database/main/index.json';

let cachedCatalog = null;
let lastCacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

export async function fetchFreshCatalog() {
  const now = Date.now();
  if (cachedCatalog && (now - lastCacheTime < CACHE_DURATION)) {
    return cachedCatalog;
  }

  try {
    const response = await fetch(INDEX_URL, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch catalog index. Status: ${response.status}`);
    }

    const rawList = await response.json();

    const parsedList = rawList.map((arr) => {
      const releaseDate = arr[8] ? String(arr[8]) : null;
      let releaseYear = null;
      if (releaseDate && releaseDate.length >= 4) {
        releaseYear = parseInt(releaseDate.substring(0, 4), 10);
      }

      return {
        id: arr[0] ? Number(arr[0]) : 0,
        title: arr[1] ? String(arr[1]) : '',
        mediaType: arr[2] === 'series' || arr[2] === 'tv' ? 'series' : 'movie',
        originalLanguage: arr[3] ? String(arr[3]).trim().toLowerCase() : '',
        originCountry: Array.isArray(arr[4]) ? arr[4].map(String) : [],
        languages: Array.isArray(arr[5]) ? arr[5].map(String) : [],
        genres: Array.isArray(arr[6]) ? arr[6].map(String) : [],
        imdbId: arr[7] ? String(arr[7]) : null,
        releaseDate,
        releaseYear,
      };
    });

    cachedCatalog = parsedList;
    lastCacheTime = now;
    return parsedList;
  } catch (error) {
    console.error('[Catalog Utility] Error loading catalog index:', error);
    // If request fails but we have cached version, return cache anyway
    if (cachedCatalog) return cachedCatalog;
    return [];
  }
}
