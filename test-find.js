async function testProxy(name, getUrl) {
  try {
    const url = 'https://vcloud.zip/3699fyu95ym3ma6';
    const proxyUrl = getUrl(url);
    console.log(`[${name}] Fetching from: ${proxyUrl}`);
    const res = await fetch(proxyUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    console.log(`[${name}] Status: ${res.status}`);
    const html = await res.text();
    const match = html.match(/id=["']size["']>([^<]+)<\/i>/i);
    if (match) {
      console.log(`[${name}] Found size: ${match[1]}`);
    } else {
      console.log(`[${name}] Size NOT found. HTML sample:`, html.slice(0, 300));
    }
  } catch (e) {
    console.error(`[${name}] Error:`, e.message);
  }
}

async function run() {
  await testProxy('corsproxy.org', (u) => `https://corsproxy.org/?url=${encodeURIComponent(u)}`);
  await testProxy('cors.eu.org', (u) => `https://cors.eu.org/${u}`);
}

run();
