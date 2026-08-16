// Multi-Channel TV & Drama Torrent Search Engine (EZTV + APIBay + DMHY)

/**
 * Search Western TV torrents using EZTV API + APIBay multi-source engine
 */
export async function searchWesternTvTorrents(imdbId, englishTitle, seasonNumber = 1) {
  const episodes = [];
  const normalizedTitle = (englishTitle || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const searchWords = normalizedTitle.split(/\s+/).filter(w => w.length > 1);

  // 1. Try EZTV (by IMDb ID) with strict title validation
  if (imdbId && imdbId.startsWith('tt')) {
    const numericId = imdbId.replace('tt', '');
    const url = `https://eztv.re/api/get-torrents?imdb_id=${numericId}&limit=100`;

    try {
      console.log(`[Western TV Search]: Fetching EZTV torrents from ${url}`);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        const rawTorrents = data.torrents || [];

        // Filter by title match & season
        const validTorrents = rawTorrents.filter(t => {
          const tNorm = t.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
          const titleMatches = searchWords.length === 0 || searchWords.every(w => tNorm.includes(w));
          const s = parseInt(t.season, 10);
          return titleMatches && (isNaN(s) || s === 0 || s === seasonNumber);
        });

        console.log(`[Western TV Search]: EZTV matched ${validTorrents.length} verified torrents for "${englishTitle}"`);

        for (const t of validTorrents) {
          const rawEp = parseInt(t.episode, 10);
          const epNum = isNaN(rawEp) || rawEp === 0 ? 'Season_Pack' : String(rawEp).padStart(2, '0');

          episodes.push({
            rawTitle: t.title,
            episodeNum: epNum,
            cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
            seasonNumber,
            is1080p: /1080p/i.test(t.title),
            is720p: /720p/i.test(t.title),
            isH264: /x264|h\.?264|avc/i.test(t.title),
            isHevc: /x265|hevc|h\.?265/i.test(t.title),
            downloadUrl: t.magnet_url || t.torrent_url,
            sizeMb: (t.size_bytes / (1024 * 1024)).toFixed(1),
            seeds: t.seeds || 0
          });
        }
      }
    } catch (err) {
      console.warn('[Western TV Search]: EZTV error:', err.message);
    }
  }

  // 2. Multi-Source Fallback (APIBay): If EZTV has no/few episodes (e.g. classic finished shows like Breaking Bad)
  if (episodes.length < 5 && englishTitle) {
    console.log(`[Western TV Search]: Querying APIBay fallback for "${englishTitle}" Season ${seasonNumber}...`);
    try {
      const qUrl = `https://apibay.org/q.php?q=${encodeURIComponent(englishTitle)}&cat=200`;
      const res = await fetch(qUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0 && data[0].name !== 'No results returned') {
          const seasonRegex = new RegExp(`S0?${seasonNumber}|Season\\s*0?${seasonNumber}|S0?1-0?${seasonNumber}|Complete`, 'i');

          for (const t of data) {
            const tNorm = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
            const titleMatches = searchWords.every(w => tNorm.includes(w));
            if (!titleMatches) continue;

            const isSeasonMatch = seasonRegex.test(t.name);
            if (!isSeasonMatch) continue;

            const magnet = `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}`;
            const epMatch = t.name.match(/S0?(\d+)[E|x](\d+)/i) || t.name.match(/(\d+)x(\d+)/i);

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
              isHevc: /x265|hevc|h265/i.test(t.name),
              downloadUrl: magnet,
              sizeMb: (parseInt(t.size, 10) / (1024 * 1024)).toFixed(1),
              seeds: parseInt(t.seeders, 10) || 0
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Western TV Search]: APIBay error:', err.message);
    }
  }

  // 3. Deduplicate and group by episode / season pack
  const grouped = new Map();
  for (const ep of episodes) {
    if (!grouped.has(ep.episodeNum)) grouped.set(ep.episodeNum, []);
    grouped.get(ep.episodeNum).push(ep);
  }

  const selected = [];
  for (const [epNum, list] of grouped.entries()) {
    list.sort((a, b) => {
      // Score: 1080p > 720p > 480p > 4K (4K deprioritized to prevent massive 6GB single episode downloads)
      const getScore = (item) => {
        let score = 0;
        if (item.is1080p) score = 100;
        else if (item.is720p) score = 80;
        else if (/480p/i.test(item.rawTitle)) score = 50;
        else if (/2160p|4k/i.test(item.rawTitle)) score = 30; // 4K only as fallback
        else score = 60;

        if (item.isH264) score += 10;
        score += Math.min(item.seeds || 0, 30);
        return score;
      };

      return getScore(b) - getScore(a);
    });
    selected.push(list[0]);
  }

  selected.sort((a, b) => {
    if (a.episodeNum === 'Season_Pack') return -1;
    if (b.episodeNum === 'Season_Pack') return 1;
    return a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true });
  });

  console.log(`[Western TV Search]: Total resolved episodes/packs for "${englishTitle}" Season ${seasonNumber}: ${selected.length}`);
  return { success: true, count: selected.length, episodes: selected };
}

/**
 * Search Chinese / Asian Drama torrents via DMHY & ACG.RIP
 */
export async function searchChineseAndAsianTvTorrents(title, originalName, seasonNumber = 1) {
  const episodes = [];
  const queryCandidates = [
    seasonNumber > 1 ? `${title} 第${seasonNumber}季` : title,
    seasonNumber > 1 ? `${title} S0${seasonNumber}` : title,
    title,
    originalName
  ].filter(Boolean);

  for (const query of queryCandidates) {
    const url = `https://share.dmhy.org/topics/rss/rss.xml?keyword=${encodeURIComponent(query)}`;
    console.log(`[Asian TV Search]: Querying DMHY for "${query}"`);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const itemMatches = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<enclosure[^>]+url=["']([^"']+)["']/gi)];

      if (itemMatches.length > 0) {
        for (const m of itemMatches) {
          const rawTitle = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
          const downloadUrl = m[2].trim();

          // Episode number extraction
          let epNum = null;
          const cnMatch = rawTitle.match(/第\s*(\d{1,3})\s*[集話话]/i);
          if (cnMatch) epNum = cnMatch[1].padStart(2, '0');

          if (!epNum) {
            const epMatch = rawTitle.match(/(?:EP|E)\s*(\d{1,3})\b/i);
            if (epMatch) epNum = epMatch[1].padStart(2, '0');
          }

          if (!epNum) {
            const bracketMatch = rawTitle.match(/\[(\d{1,3})\]/);
            if (bracketMatch) epNum = bracketMatch[1].padStart(2, '0');
          }

          if (!epNum) {
            epNum = 'Season_Pack';
          }

          episodes.push({
            rawTitle,
            episodeNum: epNum,
            cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
            seasonNumber,
            is1080p: /1080p|1920x1080/i.test(rawTitle),
            is720p: /720p/i.test(rawTitle),
            isH264: /h\.?264|avc/i.test(rawTitle),
            isHevc: /h\.?265|hevc/i.test(rawTitle),
            downloadUrl,
            sizeMb: '0',
            seeds: 1
          });
        }

        break; // Stop after first successful candidate match
      }
    } catch (err) {
      console.warn(`[Asian TV Search]: Error with query "${query}":`, err.message);
    }
  }

  // Deduplicate by episode number
  const grouped = new Map();
  for (const ep of episodes) {
    if (!grouped.has(ep.episodeNum)) grouped.set(ep.episodeNum, []);
    grouped.get(ep.episodeNum).push(ep);
  }

  const selected = [];
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      if (a.is1080p !== b.is1080p) return a.is1080p ? -1 : 1;
      if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
      return 0;
    });
    selected.push(list[0]);
  }

  selected.sort((a, b) => {
    if (a.episodeNum === 'Season_Pack') return -1;
    if (b.episodeNum === 'Season_Pack') return 1;
    return a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true });
  });

  return { success: true, count: selected.length, episodes: selected };
}

/**
 * Universal Dispatcher: Search torrents for any TMDB show
 */
export async function searchUniversalMediaTorrents({ imdbId, showName, originalName, seasonNumber = 1, showType, country = [] }) {
  const isWestern = showType === 'Western' || country.includes('US') || country.includes('GB') || country.includes('CA');
  
  if (isWestern || (imdbId && imdbId.startsWith('tt'))) {
    const westernRes = await searchWesternTvTorrents(imdbId, originalName || showName, seasonNumber);
    if (westernRes.success && westernRes.episodes.length > 0) {
      return westernRes;
    }
  }

  // Fallback to Asian / Chinese search
  return await searchChineseAndAsianTvTorrents(showName, originalName, seasonNumber);
}
