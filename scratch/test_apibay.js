async function testApiBay(query) {
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=200`; // cat 200 = Video/TV
  console.log(`\n[APIBay] Searching for "${query}" at ${url}...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`✓ APIBay returned ${data.length} torrents!`);
    
    if (data.length > 0 && data[0].name !== 'No results returned') {
      const episodes = new Map();
      
      for (const t of data) {
        // Parse S02E01, S02E02, etc.
        const epMatch = t.name.match(/S0?(\d+)[E|x](\d+)/i) || t.name.match(/(\d+)x(\d+)/i);
        if (!epMatch) continue;

        const season = parseInt(epMatch[1], 10);
        const ep = epMatch[2].padStart(2, '0');

        const magnet = `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}`;
        const parsed = {
          name: t.name,
          season,
          ep,
          sizeMb: (parseInt(t.size, 10) / (1024 * 1024)).toFixed(1),
          seeders: parseInt(t.seeders, 10),
          is1080p: /1080p/i.test(t.name),
          is720p: /720p/i.test(t.name),
          isH264: /x264|h264|h\.264|avc/i.test(t.name),
          magnet
        };

        if (!episodes.has(ep)) episodes.set(ep, []);
        episodes.get(ep).push(parsed);
      }

      console.log(`Extracted ${episodes.size} unique episodes for ${query}!`);
      for (const [ep, list] of episodes.entries()) {
        list.sort((a, b) => (b.is1080p ? 1 : 0) - (a.is1080p ? 1 : 0) || (b.isH264 ? 1 : 0) - (a.isH264 ? 1 : 0) || b.seeders - a.seeders);
        const best = list[0];
        console.log(`  EP ${ep}: ${best.name} (${best.sizeMb} MB, Seeds: ${best.seeders})`);
      }
    }
  } catch (err) {
    console.error('APIBay error:', err.message);
  }
}

async function run() {
  await testApiBay('Breaking Bad S02');
  await testApiBay('Game of Thrones S01');
  await testApiBay('Better Call Saul S01');
}

run();
