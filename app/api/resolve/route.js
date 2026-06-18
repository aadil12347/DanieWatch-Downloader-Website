import { NextResponse } from 'next/server';
import { getBaseHeaders, getAuthToken } from '@/lib/token';
import fs from 'fs';
import path from 'path';

const API_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';

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

async function fetchDownloadLinks(subjectId, se, ep, detailPath, token) {
  const params = new URLSearchParams({ subjectId, se, ep, detailPath });
  const headers = {
    'Accept': '*/*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://videodownloader.site/',
    'Referer': 'https://videodownloader.site/',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['Cookie'] = `token=${token}`;
  }
  const res = await fetch(`${API_BASE}/subject/download?${params}`, {
    method: 'GET',
    headers,
  });
  return res.json();
}

async function fetchPlayLinks(subjectId, se, ep, detailPath, token) {
  const params = new URLSearchParams({ subjectId, se, ep, detailPath });
  const headers = {
    'Accept': '*/*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://videodownloader.site/',
    'Referer': 'https://videodownloader.site/',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['Cookie'] = `token=${token}`;
  }
  const res = await fetch(`${API_BASE}/subject/play?${params}`, {
    method: 'GET',
    headers,
  });
  return res.json();
}

async function fetchDetail(detailPath) {
  const res = await fetch(`${API_BASE}/detail?detailPath=${encodeURIComponent(detailPath)}`, {
    method: 'GET',
    headers: getBaseHeaders(),
  });
  return res.json();
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return 'Unknown';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function cleanText(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // remove brackets like [Hindi]
    .replace(/\([^)]*\)/g, '') // remove parens like (2022)
    .replace(/\bs\d+(-s\d+)?\b/gi, '') // remove S1-S5, S1
    .replace(/\bseason\s*\d+\b/gi, '') // remove Season 1
    .replace(/\b(dubbed|subbed|multi|dual\s*audio|hindi|english|telugu|tamil|eng|dub|sub)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id'); // IMDb or TMDB ID
    const title = searchParams.get('title');
    const season = parseInt(searchParams.get('season')) || 0;
    const episode = parseInt(searchParams.get('episode')) || 1;

    const indexData = getIndexData();

    // 1. Lookup item in the whitelist
    // indexData entries map: [tmdbId, title, imdbId, subjectId, detailPath]
    let matchedItem = null;
    if (id) {
      const cleanId = id.trim();
      matchedItem = indexData.find(item => String(item[0]) === cleanId || String(item[2]) === cleanId);
    } else if (title) {
      const qClean = cleanText(title);
      matchedItem = indexData.find(item => cleanText(item[1]) === qClean);
    }

    if (!matchedItem) {
      return NextResponse.json({
        code: 404,
        message: 'This title or ID is not whitelisted in index.json'
      }, { status: 404 });
    }

    const officialTitle = matchedItem[1];
    const subjectId = matchedItem[3];
    const detailPath = matchedItem[4];
    
    let isTv = false;
    let detailData = null;
    let releaseYear = '';
    if (detailPath) {
      try {
        const detailResult = await fetchDetail(detailPath);
        detailData = detailResult?.data;
        const seasons = detailData?.resource?.seasons || [];
        isTv = seasons.length > 0 && seasons[0].se > 0;
        const releaseDate = detailData?.subject?.releaseDate || '';
        if (releaseDate && releaseDate.length >= 4) {
          releaseYear = releaseDate.substring(0, 4);
        }
      } catch (e) {
        console.error('Error pre-fetching detail:', e);
      }
    }
    
    const se = String(isTv ? (season || 1) : 0);
    const ep = String(isTv ? (episode || 1) : 0);

    const token = await getAuthToken();

    // 2. Fetch downloads and streaming play links directly from AoneRoom using whitelisted IDs
    const [dlResult, playResult] = await Promise.allSettled([
      fetchDownloadLinks(subjectId, se, ep, detailPath, token),
      fetchPlayLinks(subjectId, se, ep, detailPath, token),
    ]);

    const dlData = dlResult.status === 'fulfilled' ? dlResult.value?.data : {};
    const playData = playResult.status === 'fulfilled' ? playResult.value?.data : {};

    // 4. Merge and format download links
    let downloads = (dlData?.downloads || []).map(dl => {
      const size = /^\d+$/.test(dl.size) ? formatSize(parseInt(dl.size)) : (dl.size || 'Unknown');
      const type = dl.type || 'stream';
      const url = type === 'redirect' ? dl.url : `/api/stream?url=${encodeURIComponent(dl.url)}&title=${encodeURIComponent(officialTitle)}&res=${encodeURIComponent(dl.resolution || '720p')}&se=${se}&ep=${ep}&year=${releaseYear}`;
      return {
        ...dl,
        url,
        size,
        type
      };
    });
    let captions = (dlData?.captions || []).map(cap => {
      const type = cap.type || 'stream';
      const url = type === 'redirect' ? cap.url : `/api/stream?url=${encodeURIComponent(cap.url)}&title=${encodeURIComponent(officialTitle)}&res=${encodeURIComponent(cap.lanName || cap.lan || 'Subtitle')}&se=${se}&ep=${ep}&year=${releaseYear}`;
      return {
        ...cap,
        url,
        type
      };
    });
    let hasResource = dlData?.hasResource || false;

    const streams = playData?.streams || [];
    const dash = playData?.dash || [];
    const hls = playData?.hls || [];

    if (downloads.length === 0) {
      // Stream links
      for (const stream of streams) {
        if (stream.url) {
          downloads.push({
            url: `/api/stream?url=${encodeURIComponent(stream.url)}&title=${encodeURIComponent(officialTitle)}&res=${encodeURIComponent(stream.definition || stream.resolution || 'SD')}&se=${se}&ep=${ep}&year=${releaseYear}`,
            resolution: stream.definition || stream.resolution || 'SD',
            format: 'mp4',
            size: stream.size ? formatSize(stream.size) : 'Stream',
            type: 'stream',
          });
        }
      }

      // DASH links
      for (const d of dash) {
        if (d.url) {
          downloads.push({
            url: `/api/stream?url=${encodeURIComponent(d.url)}&title=${encodeURIComponent(officialTitle)}&res=${encodeURIComponent(d.definition || d.resolution || 'HD')}&se=${se}&ep=${ep}&year=${releaseYear}`,
            resolution: d.definition || d.resolution || 'HD',
            format: 'dash',
            size: d.size ? formatSize(d.size) : 'Adaptive',
            type: 'dash',
          });
        }
      }

      // HLS links
      for (const h of hls) {
        if (h.url) {
          downloads.push({
            url: `/api/stream?url=${encodeURIComponent(h.url)}&title=${encodeURIComponent(officialTitle)}&res=${encodeURIComponent(h.definition || h.resolution || 'HD')}&se=${se}&ep=${ep}&year=${releaseYear}`,
            resolution: h.definition || h.resolution || 'HD',
            format: 'hls',
            size: h.size ? formatSize(h.size) : 'Adaptive',
            type: 'hls',
          });
        }
      }

      if (streams.length > 0 || dash.length > 0 || hls.length > 0) {
        hasResource = true;
      }
    }

    // Fallback: If no direct download links are resolved, get season layout info from detail
    if (downloads.length === 0 && detailPath) {
      try {
        const activeDetailData = detailData || (await fetchDetail(detailPath))?.data;
        const resource = activeDetailData?.resource;
        const subject = activeDetailData?.subject;

        if (resource?.seasons) {
          hasResource = subject?.hasResource || false;
          const matchedSeason = resource.seasons.find(s => String(s.se) === se) || resource.seasons[0];
          if (matchedSeason?.resolutions) {
            for (const r of matchedSeason.resolutions) {
              downloads.push({
                url: `https://videodownloader.site/en/${detailPath}`,
                resolution: r.resolution,
                format: 'mp4',
                size: `${r.epNum} file${r.epNum > 1 ? 's' : ''}`,
                type: 'redirect',
                note: 'Opens in OmniSave',
              });
            }
          }
        }

        if (subject?.subtitles && captions.length === 0) {
          const subtitleLangs = subject.subtitles.split(',').filter(Boolean);
          for (const lang of subtitleLangs) {
            captions.push({
              lan: lang.trim(),
              lanName: lang.trim(),
              url: `https://videodownloader.site/en/${detailPath}`,
              type: 'redirect',
            });
          }
        }

        if (subject?.dubs && subject.dubs.length > 0) {
          const dubs = subject.dubs.filter(d => !d.original);
          if (dubs.length > 0 && downloads.length > 0) {
            downloads[0].dubs = dubs.map(d => ({
              name: d.lanName,
              code: d.lanCode,
              detailPath: d.detailPath,
              subjectId: d.subjectId,
            }));
          }
        }
      } catch (e) {
        // Ignore detail errors
      }
    }

    return NextResponse.json({
      code: 0,
      message: 'ok',
      meta: {
        matchedTitle: matchedItem[1],
        subjectId: subjectId,
        detailPath: detailPath,
        resolvedSeason: isTv ? season : null,
        resolvedEpisode: isTv ? episode : null,
      },
      data: {
        downloads,
        captions,
        hasResource,
      },
    });

  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}
