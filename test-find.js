async function testWorkerRedirect() {
  const proxyUrl = 'https://danie-watch-proxy.a03013068663.workers.dev';
  const target = 'https://vcloud.zip/3699fyu95ym3ma6';
  const testUrl = `${proxyUrl}/?url=${encodeURIComponent(target)}`;
  console.log("Fetching from:", testUrl);
  
  try {
    const res = await fetch(testUrl, { redirect: 'manual' });
    console.log("Status:", res.status);
    console.log("Location header:", res.headers.get('location'));
    const text = await res.text();
    console.log("Body snippet:", text.slice(0, 300));
  } catch (e) {
    console.error(e);
  }
}
testWorkerRedirect();
