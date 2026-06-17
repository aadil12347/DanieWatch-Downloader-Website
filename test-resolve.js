async function test() {
  const { fetchStreamLinksMap } = await import('./lib/stream-resolver.js');
  const jsonUrl = 'https://raw.githubusercontent.com/aadil12347/DanieWatch_Apk_Database/main/streaming_links/The%20Boys%20(Season%205)%20(Season%201%20to%205)_series_76479.json';
  
  console.log('Fetching stream links map for Season 1 Episode 1...');
  const map = await fetchStreamLinksMap(jsonUrl, 'series', 1, 1);
  console.log('Resolutions for S01E01:', JSON.stringify(map, null, 2));
}

test().catch(console.error);
