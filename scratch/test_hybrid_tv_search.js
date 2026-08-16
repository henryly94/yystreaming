async function searchHybridTv(englishTitle, imdbId, seasonNumber) {
  console.log(`\n======================================================`);
  console.log(`Searching: "${englishTitle}" Season ${seasonNumber} (IMDb: ${imdbId})`);
  console.log(`======================================================`);

  const episodes = [];
  const normalizedTitle = englishTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

  // 1. Try EZTV
  if (imdbId && imdbId.startsWith('tt')) {
    const numId = imdbId.replace('tt', '');
    const url = `https://eztv.re/api/get-torrents?imdb_id=${numId}&limit=100`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const data = await res.json();
        const raw = data.torrents || [];
        
        // Strict title verification: Title MUST contain the main words of englishTitle
        const words = normalizedTitle.split(/\s+/).filter(w => w.length > 2);
        const filtered = raw.filter(t => {
          const tNorm = t.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
          const titleMatches = words.every(w => tNorm.includes(w));
          const s = parseInt(t.season, 10);
          return titleMatches && (isNaN(s) || s === 0 || s === seasonNumber);
        });

        console.log(`EZTV matched ${filtered.length} valid torrents for "${englishTitle}"`);
        for (const t of filtered) {
          const ep = parseInt(t.episode, 10);
          const epNum = isNaN(ep) || ep === 0 ? 'Season_Pack' : String(ep).padStart(2, '0');
          episodes.push({
            rawTitle: t.title,
            episodeNum: epNum,
            cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
            seasonNumber,
            is1080p: /1080p/i.test(t.title),
            is720p: /720p/i.test(t.title),
            isH264: /x264|h\.?264|avc/i.test(t.title),
            downloadUrl: t.magnet_url || t.torrent_url,
            sizeMb: (t.size_bytes / (1024 * 1024)).toFixed(1),
            seeds: t.seeds || 0
          });
        }
      }
    } catch (e) {
      console.warn('EZTV error:', e.message);
    }
  }

  // 2. If EZTV has few or no episodes (e.g. older completed shows like Breaking Bad), query APIBay!
  if (episodes.length < 5) {
    console.log(`Querying APIBay fallback for "${englishTitle} Season ${seasonNumber}"...`);
    const qUrl = `https://apibay.org/q.php?q=${encodeURIComponent(`${englishTitle} S0${seasonNumber}`)}&cat=200`;
    try {
      const res = await fetch(qUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await res.json();
      
      if (data && data.length > 0 && data[0].name !== 'No results returned') {
        for (const t of data) {
          const magnet = `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}`;
          const epMatch = t.name.match(/S0?(\d+)[E|x](\d+)/i) || t.name.match(/(\d+)x(\d+)/i);
          const isPack = /Complete|Season\s*\d+|S0\d+\b/i.test(t.name);

          let epNum = 'Season_Pack';
          if (epMatch && parseInt(epMatch[1], 10) === seasonNumber) {
            epNum = epMatch[2].padStart(2, '0');
          }

          episodes.push({
            rawTitle: t.name,
            episodeNum: epNum,
            cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
            seasonNumber,
            is1080p: /1080p/i.test(t.name),
            is720p: /720p/i.test(t.name),
            isH264: /x264|h264|h\.264|avc/i.test(t.name),
            downloadUrl: magnet,
            sizeMb: (parseInt(t.size, 10) / (1024 * 1024)).toFixed(1),
            seeds: parseInt(t.seeders, 10) || 0
          });
        }
      }
    } catch (e) {
      console.warn('APIBay error:', e.message);
    }
  }

  // Deduplicate and group
  const grouped = new Map();
  for (const ep of episodes) {
    if (!grouped.has(ep.episodeNum)) grouped.set(ep.episodeNum, []);
    grouped.get(ep.episodeNum).push(ep);
  }

  const selected = [];
  for (const [num, list] of grouped.entries()) {
    list.sort((a, b) => {
      if (a.is1080p !== b.is1080p) return a.is1080p ? -1 : 1;
      if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
      return b.seeds - a.seeds;
    });
    selected.push(list[0]);
  }

  selected.sort((a, b) => a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true }));

  console.log(`\nFinal Episodes / Packs found: ${selected.length}`);
  selected.forEach(ep => console.log(`  - [${ep.episodeNum}] ${ep.cleanEpisodeName} -> ${ep.rawTitle} (${ep.sizeMb} MB, Seeds: ${ep.seeds})`));
}

async function run() {
  await searchHybridTv('Breaking Bad', 'tt0903747', 2);
  await searchHybridTv('Stranger Things', 'tt4574334', 4);
}

run();
