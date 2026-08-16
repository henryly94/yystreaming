async function testEztvHtmlSearch(query) {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const url = `https://eztv.re/search/${slug}`;
  console.log(`\nSearching EZTV HTML page: ${url}...`);

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    const html = await res.text();
    
    // Extract torrent rows from EZTV search table
    const rowMatches = [...html.matchAll(/<tr name=["']hover["'][^>]*>([\s\S]*?)<\/tr>/gi)];
    console.log(`✓ Found ${rowMatches.length} torrent rows in EZTV HTML table!`);

    const items = [];
    for (const r of rowMatches) {
      const row = r[1];
      const titleMatch = row.match(/class=["']epinfo["'][^>]*>([\s\S]*?)<\/a>/i);
      const magnetMatch = row.match(/href=["'](magnet:\?[^"']+)["']/i);
      const downloadMatch = row.match(/href=["'](https?:\/\/[^"']+\.torrent)["']/i);

      if (titleMatch && (magnetMatch || downloadMatch)) {
        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        items.push({
          title,
          downloadUrl: magnetMatch ? magnetMatch[1] : downloadMatch[1]
        });
      }
    }

    console.log(`Parsed ${items.length} clean torrent items!`);
    console.log(`Sample releases for Season 2:`);
    const s2Items = items.filter(it => /S02|Season\s*2/i.test(it.title));
    console.log(`Season 2 items count: ${s2Items.length}`);
    s2Items.slice(0, 10).forEach(it => console.log(`  - ${it.title}`));
  } catch (err) {
    console.error('EZTV HTML error:', err.message);
  }
}

async function testTgxSearch(query) {
  const url = `https://torrentgalaxy.to/torrents.php?search=${encodeURIComponent(query)}&sort=seeders&order=desc`;
  console.log(`\nSearching TorrentGalaxy: ${url}...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const matches = [...html.matchAll(/href=["']\/torrent\/\d+\/([^"']+)["']/gi)];
    console.log(`TGx matches: ${matches.length}`);
    matches.slice(0, 5).forEach(m => console.log(`  - ${m[1]}`));
  } catch (e) {
    console.log('TGx error:', e.message);
  }
}

async function run() {
  await testEztvHtmlSearch('Breaking Bad');
  await testTgxSearch('Breaking Bad S02');
}

run();
