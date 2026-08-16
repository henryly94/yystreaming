async function testImdbEztv(name, imdbId) {
  const numId = imdbId.replace('tt', '');
  const url = `https://eztv.re/api/get-torrents?imdb_id=${numId}&limit=50`;
  console.log(`\nTesting "${name}" (IMDb: ${imdbId} -> ${numId})...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`✓ Found ${data.torrents?.length || 0} torrents`);
    if (data.torrents?.length > 0) {
      data.torrents.slice(0, 3).forEach(t => console.log(`  - [S${t.season}E${t.episode}] ${t.title} (${(t.size_bytes/(1024*1024)).toFixed(1)} MB)`));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

async function run() {
  await testImdbEztv('Shogun (幕府将军)', 'tt2788316');
  await testImdbEztv('The Last of Us (最后生还者)', 'tt3581920');
  await testImdbEztv('3 Body Problem (三体 美版)', 'tt13016388');
  await testImdbEztv('House of the Dragon (龙之家族)', 'tt11198330');
  await testImdbEztv('The Boys (黑袍纠察队)', 'tt1190634');
}

run();
