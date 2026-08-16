async function testWesternTorrents(imdbId, seasonNum) {
  const numericId = imdbId.replace('tt', '');
  const url = `https://eztv.re/api/get-torrents?imdb_id=${numericId}&limit=100`;
  console.log(`[Western TV] Fetching EZTV for IMDb ID ${imdbId}...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`Total EZTV torrents: ${data.torrents?.length || 0}`);
    
    // Filter by season
    const seasonTorrents = (data.torrents || []).filter(t => parseInt(t.season, 10) === seasonNum);
    console.log(`Matching Season ${seasonNum}: ${seasonTorrents.length} torrents`);
    
    // Group by episode and pick 1080p Web-DL
    const grouped = new Map();
    for (const t of seasonTorrents) {
      const ep = String(t.episode).padStart(2, '0');
      if (!grouped.has(ep)) grouped.set(ep, []);
      grouped.get(ep).push({
        title: t.title,
        episodeNum: ep,
        seasonNum: t.season,
        is1080p: /1080p/i.test(t.title),
        isH264: /x264|h264|h\.264/i.test(t.title),
        isHevc: /x265|hevc|h265/i.test(t.title),
        downloadUrl: t.magnet_url || t.torrent_url,
        sizeMb: (t.size_bytes / (1024 * 1024)).toFixed(1),
        seeds: t.seeds
      });
    }

    console.log(`Unique Episodes in Season ${seasonNum}: ${grouped.size}`);
    for (const [ep, list] of grouped.entries()) {
      // Prioritize 1080p x264 for direct play
      list.sort((a, b) => (b.is1080p ? 1 : 0) - (a.is1080p ? 1 : 0) || (b.isH264 ? 1 : 0) - (a.isH264 ? 1 : 0) || b.seeds - a.seeds);
      const best = list[0];
      console.log(`  EP ${ep}: ${best.title} (${best.sizeMb} MB, Seeds: ${best.seeds})`);
    }
  } catch (err) {
    console.error('EZTV error:', err.message);
  }
}

async function testChineseDramaTorrents(title, seasonNum) {
  const query = `${title} ${seasonNum > 1 ? `S0${seasonNum}` : ''}`.trim();
  const url = `https://share.dmhy.org/topics/rss/rss.xml?keyword=${encodeURIComponent(query)}`;
  console.log(`\n[Chinese Drama] Fetching DMHY RSS for "${query}"...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await res.text();
    const itemMatches = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<enclosure[^>]+url=["']([^"']+)["']/gi)];
    console.log(`Found ${itemMatches.length} release items on DMHY`);
    itemMatches.slice(0, 5).forEach((m, idx) => {
      console.log(`  #${idx + 1}: ${m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()}`);
    });
  } catch (err) {
    console.error('DMHY error:', err.message);
  }
}

async function run() {
  console.log('=== Test Western TV: Stranger Things Season 4 ===');
  await testWesternTorrents('tt4574334', 4);

  console.log('\n=== Test Chinese Drama: 庆余年 第二季 ===');
  await testChineseDramaTorrents('庆余年', 2);
}

run();
