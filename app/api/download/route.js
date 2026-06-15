import { NextResponse } from 'next/server';
import { getBaseHeaders, getAuthToken } from '@/lib/token';

const API_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';

async function fetchDownloadLinks(subjectId, se, ep, detailPath, token) {
  const params = new URLSearchParams({ subjectId, se, ep, detailPath });
  const headers = {
    'Accept': '*/*',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0',
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
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0',
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const se = searchParams.get('se') || '0';
    const ep = searchParams.get('ep') || '0';
    const detailPath = searchParams.get('detailPath') || '';

    if (!subjectId) {
      return NextResponse.json({ code: 400, message: 'subjectId required' }, { status: 400 });
    }

    const token = await getAuthToken();

    // Try download endpoint first
    const [dlResult, playResult] = await Promise.allSettled([
      fetchDownloadLinks(subjectId, se, ep, detailPath, token),
      fetchPlayLinks(subjectId, se, ep, detailPath, token),
    ]);

    const dlData = dlResult.status === 'fulfilled' ? dlResult.value?.data : {};
    const playData = playResult.status === 'fulfilled' ? playResult.value?.data : {};

    // Merge download links from both endpoints and format sizes
    let downloads = (dlData?.downloads || []).map(dl => ({
      ...dl,
      size: /^\d+$/.test(dl.size) ? formatSize(parseInt(dl.size)) : (dl.size || 'Unknown')
    }));
    let captions = dlData?.captions || [];
    let hasResource = dlData?.hasResource || false;

    // If download endpoint returned nothing, check play endpoint for streams
    const streams = playData?.streams || [];
    const dash = playData?.dash || [];
    const hls = playData?.hls || [];

    // Convert streaming links to download-compatible format
    if (downloads.length === 0) {
      // Add stream links as downloads
      for (const stream of streams) {
        if (stream.url) {
          downloads.push({
            url: stream.url,
            resolution: stream.definition || stream.resolution || 'SD',
            format: 'mp4',
            size: stream.size ? formatSize(stream.size) : 'Stream',
            type: 'stream',
          });
        }
      }

      // Add DASH links
      for (const d of dash) {
        if (d.url) {
          downloads.push({
            url: d.url,
            resolution: d.definition || d.resolution || 'HD',
            format: 'dash',
            size: d.size ? formatSize(d.size) : 'Adaptive',
            type: 'dash',
          });
        }
      }

      // Add HLS links
      for (const h of hls) {
        if (h.url) {
          downloads.push({
            url: h.url,
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

    // If still no downloads, try to get resource info from detail
    if (downloads.length === 0 && detailPath) {
      try {
        const detailResult = await fetchDetail(detailPath);
        const resource = detailResult?.data?.resource;
        const subject = detailResult?.data?.subject;

        if (resource?.seasons) {
          hasResource = subject?.hasResource || false;
          const season = resource.seasons.find(s => String(s.se) === se) || resource.seasons[0];
          if (season?.resolutions) {
            // Provide available resolution info without direct links
            for (const r of season.resolutions) {
              downloads.push({
                url: hasResource ? `https://videodownloader.site/en/${detailPath}` : '',
                resolution: r.resolution,
                format: 'mp4',
                size: `${r.epNum} file${r.epNum > 1 ? 's' : ''}`,
                type: hasResource ? 'redirect' : 'not_found',
                note: hasResource ? 'Opens in OmniSave' : 'Not Found',
              });
            }
          }
        }

        // Also add subtitle info from subject
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

        // Add dub variants if available
        if (subject?.dubs && subject.dubs.length > 0) {
          const dubs = subject.dubs.filter(d => !d.original);
          if (dubs.length > 0 && downloads.length > 0) {
            // Add a note about available dubs
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

    const response = NextResponse.json({
      code: 0,
      message: 'ok',
      data: {
        downloads,
        captions,
        hasResource,
        limited: dlData?.limited || false,
        freeNum: dlData?.freeNum || 999,
      },
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return response;
  } catch (error) {
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 });
  }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return 'Unknown';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
