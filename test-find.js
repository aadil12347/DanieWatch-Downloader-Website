async function test() {
  try {
    const url = 'https://vcloud.zip/3699fyu95ym3ma6';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const html = await res.text();
    // find lines containing size, mb, gb, or file info
    const lines = html.split('\n');
    const matched = lines.filter(line => /size|mb|gb/i.test(line));
    console.log(matched.slice(0, 20).join('\n'));
  } catch (e) {
    console.error(e);
  }
}
test();
