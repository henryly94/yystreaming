// Multi-Channel TV & Drama Torrent Search Engine

/**
 * Search Western TV torrents using EZTV API by IMDb ID or Title
 */
export async function searchWesternTvTorrents(imdbId, englishTitle, seasonNumber = 1) {
  const episodes = [];

  try {
    let url = '';
    if (imdbId && imdbId.startsWith('tt')) {
      const numericId = imdbId.replace('tt', '');
      url = `https://eztv.re/api/get-torrents?imdb_id=${numericId}&limit=100`;
    } else if (englishTitle) {
      url = `https://eztv.re/api/get-torrents?search=${encodeURIComponent(englishTitle)}&limit=100`;
    }

    if (!url) return { success: false, episodes: [] };

    console.log(`[Western TV Search]: Fetching EZTV torrents from ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`[Western TV Search]: EZTV returned HTTP status ${res.status}`);
      return { success: false, episodes: [] };
    }

    const data = await res.json();
    const rawTorrents = data.torrents || [];
    console.log(`[Western TV Search]: Found ${rawTorrents.length} total torrents on EZTV`);

    // Filter by season
    const seasonTorrents = rawTorrents.filter(t => {
      const s = parseInt(t.season, 10);
      return isNaN(s) || s === 0 || s === seasonNumber;
    });

    // Group by episode number
    const grouped = new Map();
    for (const t of seasonTorrents) {
      const rawEp = parseInt(t.episode, 10);
      // Skip complete season packs if episode is 0 and we want single episodes, unless no other episodes exist
      const epNum = isNaN(rawEp) || rawEp === 0 ? 'Full_Season' : String(rawEp).padStart(2, '0');

      const is1080p = /1080p/i.test(t.title);
      const is720p = /720p/i.test(t.title);
      const isH264 = /x264|h\.?264|avc/i.test(t.title);
      const isHevc = /x265|hevc|h\.?265/i.test(t.title);

      const parsed = {
        rawTitle: t.title,
        episodeNum: epNum,
        cleanEpisodeName: epNum === 'Full_Season' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
        seasonNumber,
        is1080p,
        is720p,
        isH264,
        isHevc,
        downloadUrl: t.magnet_url || t.torrent_url,
        sizeMb: (t.size_bytes / (1024 * 1024)).toFixed(1),
        seeds: t.seeds || 0
      };

      if (!grouped.has(epNum)) grouped.set(epNum, []);
      grouped.get(epNum).push(parsed);
    }

    // Pick best per episode (prioritize 1080p H.264 for Direct Play compatibility)
    for (const [epNum, list] of grouped.entries()) {
      if (epNum === 'Full_Season' && grouped.size > 1) {
        // If we already have individual episodes, ignore the full pack row
        continue;
      }

      list.sort((a, b) => {
        if (a.is1080p !== b.is1080p) return a.is1080p ? -1 : 1;
        if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
        return b.seeds - a.seeds;
      });

      episodes.push(list[0]);
    }

    episodes.sort((a, b) => a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true }));
    return { success: true, count: episodes.length, episodes };
  } catch (err) {
    console.error('[Western TV Search]: Error searching Western TV:', err.message);
    return { success: false, episodes: [] };
  }
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
            epNum = `EP_${Math.abs(rawTitle.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)).toString(36).slice(0, 4)}`;
          }

          episodes.push({
            rawTitle,
            episodeNum: epNum,
            cleanEpisodeName: `Episode ${epNum}`,
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

  selected.sort((a, b) => a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true }));
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
