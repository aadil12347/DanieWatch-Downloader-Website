const d = JSON.parse(require('fs').readFileSync('debug_output.json', 'utf8'));
const html = d.debug.tokenHtml || '';
console.log('HTML length:', html.length);
console.log('Has fsl:', html.includes('fsl'));
console.log('Has hubcloud:', html.includes('hubcloud'));
console.log('Has FSL Server:', html.includes('FSL Server'));
console.log('Has 10Gbps:', html.includes('10Gbps'));
console.log('Has gpdl:', html.includes('gpdl'));
console.log('Has download:', html.includes('download'));
console.log('Has token:', html.includes('token'));
console.log('Has ?q=:', html.includes('?q='));

// Search for inline scripts
const inlineScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
if (inlineScripts) {
  console.log('\n--- Inline scripts found:', inlineScripts.length);
  inlineScripts.forEach((s, i) => {
    if (s.length > 50 && !s.includes('src=')) {
      console.log(`\nScript ${i} (${s.length} chars):`);
      console.log(s.slice(0, 500));
    }
  });
}

// Search for script src
const extScripts = html.match(/src=["']([^"']+\.js[^"']*)["']/gi);
if (extScripts) {
  console.log('\n--- External scripts:');
  extScripts.forEach(s => console.log(s));
}
