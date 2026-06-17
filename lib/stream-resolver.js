import { fetchViaScriptProxy } from './proxy-fetch.js';

const STREAM_LINKS_BASE = 'https://raw.githubusercontent.com/aadil12347/DanieWatch_Apk_Database/main/streaming_links';
const GITHUB_TREES_API = 'https://api.github.com/repos/aadil12347/DanieWatch_Apk_Database/git/trees/main?recursive=1';

let fileMapCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

async function refreshFileMapCache() {
  const fileMap = new Map();
  try {
    let headers = { 'Accept': 'application/vnd.github+json' };
    const hasToken = !!process.env.GITHUB_TOKEN;
    if (hasToken) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    // Use Git Trees API (supports up to 100k files) instead of Contents API (1000 file limit)
    let response = await fetch(GITHUB_TREES_API, {
      headers,
      next: { revalidate: 600 }
    });

    if ((response.status === 401 || response.status === 403) && hasToken) {
      console.warn(`[Stream Resolver] Git Trees API returned ${response.status} with GITHUB_TOKEN. Retrying without token...`);
      headers = { 'Accept': 'application/vnd.github+json' };
      response = await fetch(GITHUB_TREES_API, {
        headers,
        next: { revalidate: 600 }
      });
    }

    if (response.ok) {
      const treeData = await response.json();
      const allNodes = treeData.tree || [];
      
      // Filter only files inside streaming_links/ directory
      const streamFiles = allNodes.filter(
        node => node.type === 'blob' && node.path.startsWith('streaming_links/') && node.path.endsWith('.json')
      );
      
      console.log(`[Stream Resolver] Git Trees API returned ${allNodes.length} total nodes, ${streamFiles.length} streaming_links JSON files. Truncated: ${treeData.truncated || false}`);

      const tmdbRegExp = /_(?:movie|series|custom_series)_(\d+)/;
      const imdbRegExp = /(tt\d+)/;

      for (const node of streamFiles) {
        // node.path = "streaming_links/The Boys (Season 1 to 5) (2019)_series_76479.json"
        const name = node.path.replace('streaming_links/', '');
        const downloadUrl = `${STREAM_LINKS_BASE}/${encodeURIComponent(name)}`;
        const fileEntry = { name, downloadUrl };

        // Index by TMDB ID
        const tmdbMatch = name.match(tmdbRegExp);
        if (tmdbMatch) {
          const key = `tmdb_${tmdbMatch[1]}`;
          if (!fileMap.has(key)) {
            fileMap.set(key, []);
          }
          fileMap.get(key).push(fileEntry);
        }
        // Index by IMDB ID
        const imdbMatch = name.match(imdbRegExp);
        if (imdbMatch) {
          const key = `imdb_${imdbMatch[1]}`;
          if (!fileMap.has(key)) {
            fileMap.set(key, []);
          }
          fileMap.get(key).push(fileEntry);
        }
      }
      
      console.log(`[Stream Resolver] Indexed ${fileMap.size} unique IDs in cache`);
    } else {
      console.error(`[Stream Resolver] Git Trees API failed with status ${response.status}`);
    }
  } catch (e) {
    console.error('[Stream Resolver] Failed to fetch directory listing from GitHub', e);
  }
  return fileMap;
}

function cleanBaseTitle(title) {
  if (!title) return '';
  return title
    .replace(/\[[^\]]*\]/g, '') // remove brackets like [Hindi]
    .replace(/\([^)]*\)/g, '') // remove parens like (2022)
    .replace(/\bs\d+(-s\d+)?\b/gi, '') // remove S1-S5
    .replace(/\bseason\s*\d+\b/gi, '') // remove Season 1
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeTitle(title) {
  return title
    .replace(/[:/\\*?"<>|]/g, '-')
    .trim();
}

async function checkGuessedFallbacks(title, mediaType, tmdbId, releaseYear, season) {
  const cleanTitle = cleanBaseTitle(title);
  const sanitized = sanitizeTitle(cleanTitle);
  const guesses = [];

  if (mediaType === 'movie') {
    if (releaseYear) {
      guesses.push(`${sanitized} (${releaseYear})_movie_${tmdbId}.json`);
    }
    guesses.push(`${sanitized}_movie_${tmdbId}.json`);
  } else {
    const sNum = season || 1;
    if (releaseYear) {
      guesses.push(`${sanitized} (Season ${sNum}) (${releaseYear})_series_${tmdbId}.json`);
    }
    guesses.push(`${sanitized} (Season ${sNum})_series_${tmdbId}.json`);
    guesses.push(`${sanitized}_series_${tmdbId}.json`);
  }

  for (const name of guesses) {
    const targetUrl = `${STREAM_LINKS_BASE}/${encodeURIComponent(name)}`;
    try {
      const resp = await fetch(targetUrl, { method: 'HEAD' });
      if (resp.status === 200) {
        return targetUrl;
      }
    } catch (e) {}
  }

  return null;
}

export async function getStreamingJsonUrl(tmdbId, mediaType, title, releaseYear, imdbId, seasonNumber) {
  const now = Date.now();
  if (!fileMapCache || (now - lastCacheTime > CACHE_DURATION)) {
    fileMapCache = await refreshFileMapCache();
    lastCacheTime = now;
  }

  const pickBestFile = (filesList) => {
    if (!filesList || filesList.length === 0) return null;
    if (mediaType === 'movie' || !seasonNumber) {
      return filesList[0].downloadUrl;
    }
    
    // For series, look for a file matching the requested season
    const targetSeasonStr = String(seasonNumber);
    const targetSeasonPadded = targetSeasonStr.padStart(2, '0');
    
    const seasonRegexes = [
      new RegExp(`\\bSeason\\s*${targetSeasonStr}\\b`, 'i'),
      new RegExp(`\\bSeason\\s*${targetSeasonPadded}\\b`, 'i'),
      new RegExp(`\\bSeason\\s*\\d+\\s*to\\s*${targetSeasonStr}\\b`, 'i'),
      new RegExp(`\\bSeason\\s*\\d+\\s*to\\s*${targetSeasonPadded}\\b`, 'i'),
      new RegExp(`\\bSeason\\s*${targetSeasonStr}\\s*to\\s*\\d+\\b`, 'i'),
      new RegExp(`\\bSeason\\s*${targetSeasonPadded}\\s*to\\s*\\d+\\b`, 'i'),
    ];

    for (const regex of seasonRegexes) {
      const match = filesList.find(f => regex.test(f.name));
      if (match) return match.downloadUrl;
    }

    return filesList[0].downloadUrl;
  };

  // 1. Direct Directory Cache lookup
  const tmdbKey = `tmdb_${tmdbId}`;
  if (fileMapCache.has(tmdbKey)) {
    const url = pickBestFile(fileMapCache.get(tmdbKey));
    if (url) return url;
  }

  if (imdbId) {
    const imdbKey = `imdb_${imdbId}`;
    if (fileMapCache.has(imdbKey)) {
      const url = pickBestFile(fileMapCache.get(imdbKey));
      if (url) return url;
    }
  }

  // 2. Guess Pattern Suffix fallback check
  return checkGuessedFallbacks(title, mediaType, tmdbId, releaseYear, seasonNumber);
}

export async function fetchStreamLinksMap(streamJsonUrl, mediaType, seasonNumber, episodeNumber) {
  const resolutions = {};
  try {
    const response = await fetch(streamJsonUrl, { cache: 'no-store' });
    if (!response.ok) return resolutions;

    const data = await response.json();

    if (mediaType === 'movie') {
      // 1. New format: data.links contains resolution keys mapping to arrays or strings
      if (data.links && typeof data.links === 'object') {
        for (const res of Object.keys(data.links)) {
          const val = data.links[res];
          if (Array.isArray(val) && val.length > 0) {
            const match = val.find(item => {
              const t = String(item.episode_title || '').toLowerCase();
              return t === 'episode 01' || t === 'episode 1';
            }) || val[0];
            if (match && match.link) {
              resolutions[res] = match.link;
            }
          } else if (typeof val === 'string' && val.startsWith('http')) {
            resolutions[res] = val;
          }
        }
      } else {
        // 2. Old format: root keys are resolutions
        for (const res of Object.keys(data)) {
          if (typeof data[res] === 'string' && data[res].startsWith('http')) {
            resolutions[res] = data[res];
          }
        }
      }
    } else {
      // TV Series format: { seasons: { "01": { "1080p": [ { episode_title: "Episode 1", link: "..." } ] } } }
      const seasons = data.seasons;
      if (!seasons || !seasonNumber) return resolutions;

      const paddedSeason = String(seasonNumber).padStart(2, '0');
      let seasonData = seasons[paddedSeason] || seasons[String(seasonNumber)];
      if (!seasonData) return resolutions;

      const epNum = episodeNumber || 1;
      const targetPadded = `Episode ${String(epNum).padStart(2, '0')}`.toLowerCase();
      const targetUnpadded = `Episode ${epNum}`.toLowerCase();

      for (const res of Object.keys(seasonData)) {
        const episodesList = seasonData[res];
        if (Array.isArray(episodesList)) {
          const match = episodesList.find((item) => {
            const t = String(item.episode_title || '').toLowerCase();
            return t === targetPadded || t === targetUnpadded;
          });
          if (match && match.link) {
            resolutions[res] = match.link;
          }
        }
      }
    }
  } catch (error) {
    console.error('[Stream Resolver] Error reading resolution map:', error);
  }
  return resolutions;
}

export async function parseVcloudLayout(streamJsonUrl, mediaType) {
  try {
    const response = await fetch(streamJsonUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();

    if (mediaType === 'movie') {
      const resolutions = [];
      // Support new links format
      if (data.links && typeof data.links === 'object') {
        for (const res of Object.keys(data.links)) {
          if (!resolutions.includes(res)) {
            resolutions.push(res);
          }
        }
      }
      // Support old root format
      for (const res of Object.keys(data)) {
        if (typeof data[res] === 'string' && data[res].startsWith('http')) {
          if (!resolutions.includes(res)) {
            resolutions.push(res);
          }
        }
      }
      return { mediaType: 'movie', resolutions };
    } else {
      const layout = {};
      const seasonsData = data.seasons || {};
      for (const [seasonStr, resolutionsObj] of Object.entries(seasonsData)) {
        const seasonNum = parseInt(seasonStr, 10);
        if (isNaN(seasonNum)) continue;
        
        const epNumsSet = new Set();
        for (const [resStr, episodesArray] of Object.entries(resolutionsObj)) {
          if (Array.isArray(episodesArray)) {
            for (const epObj of episodesArray) {
              const titleLower = String(epObj.episode_title || '').toLowerCase();
              const epMatch = titleLower.match(/episode\s*(\d+)/);
              if (epMatch) {
                epNumsSet.add(parseInt(epMatch[1], 10));
              }
            }
          }
        }
        layout[seasonNum] = Array.from(epNumsSet).sort((a, b) => a - b);
      }
      return { mediaType: 'series', layout };
    }
  } catch (error) {
    console.error('[Stream Resolver] Error parsing layout:', error);
    return null;
  }
}

function getFetchUrl(url) {
  const proxyUrl = process.env.CLOUDFLARE_WORKER_PROXY_URL;
  if (proxyUrl && proxyUrl.startsWith('http') && !proxyUrl.includes('your-subdomain')) {
    return `${proxyUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function getResolutionsWithSize(resolutionsMap) {
  const result = {};
  for (const [resName, url] of Object.entries(resolutionsMap)) {
    result[resName] = {
      url,
      size: 'Size N/A'
    };
  }
  return result;
}

