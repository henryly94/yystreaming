// Multi-Channel TV & Drama Torrent Search Engine (EZTV + APIBay + DMHY)

/**
 * Search Western TV torrents using EZTV API (with multi-page pagination) + APIBay multi-source engine
 */
export async function searchWesternTvTorrents(imdbId, englishTitle, seasonNumber = 1) {
  const allRawEpisodes = [];
  const normalizedTitle = (englishTitle || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const searchWords = normalizedTitle.split(/\s+/).filter(w => w.length > 1);

  // 1. Try EZTV (by IMDb ID) with multi-page pagination (up to 4 pages for deep historical season support)
  if (imdbId && imdbId.startsWith('tt')) {
    const numericId = imdbId.replace('tt', '');
    
    for (let page = 1; page <= 4; page++) {
      const url = `https://eztv.re/api/get-torrents?imdb_id=${numericId}&limit=100&page=${page}`;

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json'
          }
        });

        if (!res.ok) break;
        const data = await res.json();
        const rawTorrents = data.torrents || [];
        if (rawTorrents.length === 0) break;

        // Filter by title match & season
        const validTorrents = rawTorrents.filter(t => {
          const tNorm = t.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
          const titleMatches = searchWords.length === 0 || searchWords.every(w => tNorm.includes(w));
          const s = parseInt(t.season, 10);
          return titleMatches && (isNaN(s) || s === 0 || s === seasonNumber);
        });

        for (const t of validTorrents) {
          const rawEp = parseInt(t.episode, 10);
          const epNum = isNaN(rawEp) || rawEp === 0 ? 'Season_Pack' : String(rawEp).padStart(2, '0');

          allRawEpisodes.push({
            rawTitle: t.title,
            episodeNum: epNum,
            cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
            seasonNumber,
            is1080p: /1080p/i.test(t.title),
            is720p: /720p/i.test(t.title),
            isH264: /x264|h\.?264|avc/i.test(t.title) && !/x265|hevc|h\.?265/i.test(t.title),
            isHevc: /x265|hevc|h\.?265/i.test(t.title),
            downloadUrl: t.magnet_url || t.torrent_url,
            sizeMb: (t.size_bytes / (1024 * 1024)).toFixed(1),
            seeds: t.seeds || 0
          });
        }

        // If we found enough episodes for the requested season on early pages, stop pagination
        const foundSeasonEps = new Set(allRawEpisodes.filter(e => e.episodeNum !== 'Season_Pack').map(e => e.episodeNum));
        if (foundSeasonEps.size >= 10 && page >= 2) break;
      } catch (err) {
        console.warn(`[Western TV Search]: EZTV page ${page} error:`, err.message);
        break;
      }
    }
  }

  // 2. Multi-Source Fallback (APIBay): If EZTV has no/few episodes (e.g. classic finished shows like Breaking Bad)
  const uniqueEpNums = new Set(allRawEpisodes.map(e => e.episodeNum));
  if (uniqueEpNums.size < 5 && englishTitle) {
    console.log(`[Western TV Search]: Querying APIBay fallback for "${englishTitle}" Season ${seasonNumber}...`);
    try {
      const qUrl = `https://apibay.org/q.php?q=${encodeURIComponent(englishTitle)}&cat=200`;
      const res = await fetch(qUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0 && data[0].name !== 'No results returned') {
          for (const t of data) {
            const tNorm = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
            const titleMatches = searchWords.every(w => tNorm.includes(w));
            if (!titleMatches) continue;

            // Direct Episode / Season Match: S02, S02E01, Season 2, S2E1, Season.02
            const directRegex = new RegExp(`(?:\\bS0?${seasonNumber}(?:E\\d+|\\b)|\\bSeason[.\\s_-]*0?${seasonNumber}\\b)`, 'i');
            let isSeasonMatch = directRegex.test(t.name);

            // Boxsets covering seasonNumber (e.g. S01-S05)
            if (!isSeasonMatch) {
              const boxsetMatch = t.name.match(/(?:s0?1\s*-\s*s?0?([2-9])|seasons?\s*0?1\s*-\s*0?([2-9]))/i);
              if (boxsetMatch) {
                const endSeason = parseInt(boxsetMatch[1] || boxsetMatch[2], 10);
                if (seasonNumber <= endSeason) isSeasonMatch = true;
              }
            }

            if (!isSeasonMatch) continue;

            const magnet = `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}`;
            const epMatch = t.name.match(/S0?(\d+)[E|x](\d+)/i) || t.name.match(/(\d+)x(\d+)/i);

            let epNum = 'Season_Pack';
            if (epMatch && parseInt(epMatch[1], 10) === seasonNumber) {
              epNum = epMatch[2].padStart(2, '0');
            }

            allRawEpisodes.push({
              rawTitle: t.name,
              episodeNum: epNum,
              cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
              seasonNumber,
              is1080p: /1080p/i.test(t.name),
              is720p: /720p/i.test(t.name),
              isH264: /x264|h264|h\.264|avc/i.test(t.name) && !/x265|hevc|h\.?265/i.test(t.name),
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

  // 3. Organize all releases by episode number
  const allReleasesByEpisode = {};
  for (const ep of allRawEpisodes) {
    if (!allReleasesByEpisode[ep.episodeNum]) {
      allReleasesByEpisode[ep.episodeNum] = [];
    }
    // Deduplicate exact downloadUrl
    if (!allReleasesByEpisode[ep.episodeNum].some(existing => existing.downloadUrl === ep.downloadUrl)) {
      allReleasesByEpisode[ep.episodeNum].push(ep);
    }
  }

  // Sort releases inside each episode (Seeds > Resolution)
  for (const epNum of Object.keys(allReleasesByEpisode)) {
    allReleasesByEpisode[epNum].sort((a, b) => {
      if (a.is1080p !== b.is1080p) return b.is1080p ? 1 : -1;
      return (b.seeds || 0) - (a.seeds || 0);
    });
  }

  // 4. Build Cohesive Release Packages (Profiles)
  const packageConfigs = [
    {
      id: '1080p_h264',
      name: '⚡ 1080p H.264 (Recommended)',
      desc: '1080p H.264 · ⚡ 2s Remux / Native Direct Play',
      badge: '⚡ Fast Remux',
      badgeColor: 'green',
      filter: (item) => item.is1080p && item.isH264,
      fallbackFilter: (item) => item.isH264 || item.is1080p
    },
    {
      id: '1080p_hevc',
      name: '🔥 1080p HEVC (x265)',
      desc: '1080p HEVC · 50% Space Saving / High Efficiency',
      badge: '🔥 Compact Size',
      badgeColor: 'purple',
      filter: (item) => item.is1080p && item.isHevc,
      fallbackFilter: (item) => item.isHevc || item.is1080p
    },
    {
      id: '720p_h264',
      name: '⚡ 720p H.264',
      desc: '720p H.264 · Ultra-Fast Download / Low Bandwidth',
      badge: '⚡ Fast Download',
      badgeColor: 'blue',
      filter: (item) => item.is720p && item.isH264,
      fallbackFilter: (item) => item.is720p || item.isH264
    },
    {
      id: '720p_hevc',
      name: '🔥 720p HEVC (x265)',
      desc: '720p HEVC · Minimal Storage Footprint',
      badge: '🔥 Ultra-Light',
      badgeColor: 'indigo',
      filter: (item) => item.is720p && item.isHevc,
      fallbackFilter: (item) => item.isHevc
    }
  ];

  const packages = [];
  const individualEpisodeNums = Object.keys(allReleasesByEpisode)
    .filter(k => k !== 'Season_Pack')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const config of packageConfigs) {
    const pkgEpisodes = [];
    let totalSizeMb = 0;

    for (const epNum of individualEpisodeNums) {
      const candidates = allReleasesByEpisode[epNum];
      if (!candidates || candidates.length === 0) continue;

      // 1. Exact package criteria match
      let chosen = candidates.find(config.filter);
      // 2. Coherent fallback criteria
      if (!chosen && config.fallbackFilter) {
        chosen = candidates.find(config.fallbackFilter);
      }
      // 3. Fallback to best available
      if (!chosen) {
        chosen = candidates[0];
      }

      if (chosen) {
        pkgEpisodes.push(chosen);
        totalSizeMb += parseFloat(chosen.sizeMb || '0');
      }
    }

    if (pkgEpisodes.length > 0) {
      packages.push({
        id: config.id,
        name: config.name,
        desc: config.desc,
        badge: config.badge,
        badgeColor: config.badgeColor,
        episodeCount: pkgEpisodes.length,
        totalSizeMb: Math.round(totalSizeMb),
        episodes: pkgEpisodes
      });
    }
  }

  // Include Season Packs package if season pack torrents exist
  const seasonPacks = allReleasesByEpisode['Season_Pack'] || [];
  if (seasonPacks.length > 0) {
    packages.push({
      id: 'season_packs',
      name: '📦 Season Complete Packs',
      desc: 'All-in-one single torrent downloads for entire season',
      badge: '📦 Full Season Pack',
      badgeColor: 'amber',
      episodeCount: seasonPacks.length,
      totalSizeMb: Math.round(seasonPacks.reduce((acc, p) => acc + parseFloat(p.sizeMb || '0'), 0) / seasonPacks.length),
      episodes: seasonPacks
    });
  }

  // Select default package (favor 1080p H.264 if available, otherwise first package)
  const defaultPkg = packages.find(p => p.id === '1080p_h264') || packages[0];
  const defaultEpisodes = defaultPkg ? defaultPkg.episodes : [];

  console.log(`[Western TV Search]: Resolved ${packages.length} packages for "${englishTitle}" Season ${seasonNumber} (Default: ${defaultPkg?.name}, ${defaultEpisodes.length} episodes)`);

  return {
    success: true,
    count: defaultEpisodes.length,
    episodes: defaultEpisodes,
    packages,
    defaultPackageId: defaultPkg?.id || '1080p_h264',
    allReleasesByEpisode
  };
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
