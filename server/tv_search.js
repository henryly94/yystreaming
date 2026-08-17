// Multi-Channel TV & Drama Torrent Search Engine (EZTV + APIBay + DMHY)

/**
 * Standardized subtitle metadata parser
 */
export function parseSubtitleInfo(rawTitle) {
  const t = rawTitle || '';
  
  // 1. Simplified Chinese
  const isChs = /简[体中日繁]|CHS|GB|GBK|ZH[-_]CN|ZH[-_]HANS|Chi_Sim|简体|内嵌简|内封简|简繁/i.test(t);
  
  // 2. Traditional Chinese
  const isCht = /繁[体中日简]|CHT|BIG5|ZH[-_]TW|ZH[-_]HK|ZH[-_]HANT|Chi_Tra|繁体|内嵌繁|内封繁|简繁/i.test(t);
  
  // 3. Bilingual / Multi
  const isBilingual = /双语|中英|中日|简日|繁日|DualSub/i.test(t);
  const isMulti = /Multi(?:sub|[-_]sub)|多语字幕|多国语言/i.test(t);
  
  // Generic Chinese Match
  const isGenericChinese = /中字|中文字幕|国语|国英/i.test(t) || isChs || isCht || isBilingual;
  
  // 4. English
  const isEng = /\b(?:ENG|English|Subbed|EN[-_]US|En[-_]Sub|English\s*Sub(?:titles?)?)\b/i.test(t) || isMulti || /ENG[-_]/i.test(t);
  
  // 5. Raw / No sub
  const isRaw = /\b(?:RAW|RAWS|NCED|NCOP)\b/i.test(t) && !isGenericChinese && !isEng;

  const badges = [];
  if (isChs && isCht) {
    badges.push({ code: 'chs_cht', label: '🇨🇳 简繁', color: 'green' });
  } else if (isBilingual) {
    badges.push({ code: 'bilingual', label: '🌐 中英双语', color: 'emerald' });
  } else {
    if (isChs) badges.push({ code: 'chs', label: '🇨🇳 简中', color: 'green' });
    if (isCht) badges.push({ code: 'cht', label: '🇭🇰 繁中', color: 'purple' });
    if (isGenericChinese && !isChs && !isCht) badges.push({ code: 'chs', label: '🇨🇳 中字', color: 'green' });
  }

  if (isMulti) {
    badges.push({ code: 'multi', label: '🌐 多国字幕', color: 'indigo' });
  } else if (isEng && !isBilingual && !(isChs && isCht)) {
    badges.push({ code: 'eng', label: '🇺🇸 英文', color: 'blue' });
  }

  if (isRaw) {
    badges.push({ code: 'raw', label: '🈳 RAW生肉', color: 'gray' });
  }

  return {
    isChs: isChs || isBilingual || (isGenericChinese && !isCht),
    isCht: isCht || (isBilingual && isCht),
    isEng: isEng || isBilingual || isMulti,
    isBilingual,
    isMulti,
    isRaw,
    badges
  };
}

/**
 * Search Western TV torrents using EZTV API (with multi-page pagination) + APIBay multi-source engine
 */
export async function searchWesternTvTorrents(imdbId, englishTitle, seasonNumber = 1) {
  const allRawEpisodes = [];
  const cleanImdb = imdbId && imdbId.startsWith('tt') ? imdbId : '';
  const normalizedTitle = (englishTitle || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const searchWords = normalizedTitle.split(/\s+/).filter(w => w.length > 1);

  if (!cleanImdb && searchWords.length === 0) {
    return { success: false, episodes: [], packages: [], count: 0, allReleasesByEpisode: {} };
  }

  // 1. Try EZTV (by IMDb ID) with multi-page pagination (up to 4 pages for deep historical season support)
  if (cleanImdb) {
    const numericId = cleanImdb.replace('tt', '');
    
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

          const is4k = /2160p|4k/i.test(t.title);
          const is1080p = /1080p/i.test(t.title) && !is4k;
          const is720p = /720p/i.test(t.title);
          const isHevc = /x265|hevc|h\.?265/i.test(t.title);
          const isH264 = (/x264|h\.?264|avc/i.test(t.title) || (!isHevc && !is4k)) && !isHevc;
          const subInfo = parseSubtitleInfo(t.title);

          allRawEpisodes.push({
            rawTitle: t.title,
            episodeNum: epNum,
            cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
            seasonNumber,
            is4k,
            is1080p,
            is720p,
            isH264,
            isHevc,
            subtitles: subInfo,
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
  if (uniqueEpNums.size < 5 && searchWords.length > 0) {
    console.log(`[Western TV Search]: Querying APIBay fallback for "${englishTitle}" Season ${seasonNumber}...`);
    try {
      const qUrl = `https://apibay.org/q.php?q=${encodeURIComponent(searchWords.join(' '))}&cat=200`;
      const res = await fetch(qUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0 && data[0].name !== 'No results returned') {
          for (const t of data) {
            const tNorm = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
            const titleMatches = searchWords.length > 0 && searchWords.every(w => tNorm.includes(w));
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

            const is4k = /2160p|4k/i.test(t.name);
            const is1080p = /1080p/i.test(t.name) && !is4k;
            const is720p = /720p/i.test(t.name);
            const isHevc = /x265|hevc|h\.?265/i.test(t.name);
            const isH264 = (/x264|h264|h\.264|avc/i.test(t.name) || (!isHevc && !is4k)) && !isHevc;

            allRawEpisodes.push({
              rawTitle: t.name,
              episodeNum: epNum,
              cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
              seasonNumber,
              is4k,
              is1080p,
              is720p,
              isH264,
              isHevc,
              subtitles: parseSubtitleInfo(t.name),
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

  // Sort releases inside each episode:
  // Prefer standard Web-DL / HDTV (400MB - 1800MB) > BluRay Remux (3500MB+) > 4K, then Seeds
  for (const epNum of Object.keys(allReleasesByEpisode)) {
    allReleasesByEpisode[epNum].sort((a, b) => {
      const getEpScore = (item) => {
        let score = 0;
        const size = parseFloat(item.sizeMb || '0');
        if (item.is1080p) score += 100;
        else if (item.is720p) score += 80;
        else if (item.is4k) score += 40; // 4K only as dedicated fallback
        else score += 50;

        if (item.isH264) score += 20;

        // Size sweet spot for a single episode: 300MB - 1800MB
        if (size >= 300 && size <= 1800) score += 30;
        else if (size > 3500) score -= 20; // Penalize massive remuxes

        score += Math.min(item.seeds || 0, 20);
        return score;
      };
      return getEpScore(b) - getEpScore(a);
    });
  }

  // 4. Build Strict Cohesive Release Packages (Profiles)
  const packageConfigs = [
    {
      id: '1080p_h264',
      name: '⚡ 1080p H.264',
      desc: '1080p H.264 · ⚡ 2s Remux / Native Direct Play',
      badge: '⚡ Fast Remux',
      badgeColor: 'green',
      match: (item) => !item.is4k && item.isH264 && item.is1080p,
      fallback: (item) => !item.is4k && item.isH264
    },
    {
      id: '1080p_hevc',
      name: '🔥 1080p HEVC (x265)',
      desc: '1080p HEVC · 50% Space Saving / High Efficiency',
      badge: '🔥 Compact Size',
      badgeColor: 'purple',
      match: (item) => !item.is4k && item.isHevc && item.is1080p,
      fallback: (item) => !item.is4k && item.isHevc
    },
    {
      id: '720p_h264',
      name: '⚡ 720p H.264',
      desc: '720p H.264 · Ultra-Fast Download / Low Bandwidth',
      badge: '⚡ Fast Download',
      badgeColor: 'blue',
      match: (item) => !item.is4k && item.isH264 && item.is720p,
      fallback: (item) => !item.is4k && item.isH264
    },
    {
      id: '720p_hevc',
      name: '🔥 720p HEVC (x265)',
      desc: '720p HEVC · Minimal Storage Footprint',
      badge: '🔥 Ultra-Light',
      badgeColor: 'indigo',
      match: (item) => !item.is4k && item.isHevc && item.is720p,
      fallback: (item) => !item.is4k && item.isHevc
    },
    {
      id: '4k_uhd',
      name: '🎬 4K UHD (2160p)',
      desc: '4K 2160p Ultra HD · High Bitrate',
      badge: '🎬 4K UHD',
      badgeColor: 'amber',
      match: (item) => item.is4k,
      fallback: (item) => item.is4k
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

      let chosen = candidates.find(config.match);
      if (!chosen && config.fallback) {
        chosen = candidates.find(config.fallback);
      }

      if (chosen) {
        pkgEpisodes.push(chosen);
        totalSizeMb += parseFloat(chosen.sizeMb || '0');
      }
    }

    // STRICT: Only include package if it covers at least 60% of available season episodes
    if (pkgEpisodes.length >= Math.max(1, individualEpisodeNums.length * 0.6)) {
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
    seasonPacks.sort((a, b) => {
      const sizeA = parseFloat(a.sizeMb || '0');
      const sizeB = parseFloat(b.sizeMb || '0');
      const scoreA = (a.seeds || 0) + (sizeA >= 1000 && sizeA <= 12000 ? 200 : 0);
      const scoreB = (b.seeds || 0) + (sizeB >= 1000 && sizeB <= 12000 ? 200 : 0);
      return scoreB - scoreA;
    });

    packages.push({
      id: 'season_packs',
      name: '📦 Season Complete Packs',
      desc: 'All-in-one single torrent downloads for entire season',
      badge: '📦 Full Season Pack',
      badgeColor: 'amber',
      episodeCount: seasonPacks.length,
      totalSizeMb: Math.round(seasonPacks[0] ? parseFloat(seasonPacks[0].sizeMb || '0') : 0),
      episodes: seasonPacks
    });
  }

  // Smart Default Selection:
  // 1. 1080p H.264 if available
  // 2. 1080p HEVC if available
  // 3. 720p H.264 if available
  // 4. Season Packs (prioritized over 4K UHD to avoid huge 40GB default downloads)
  // 5. 4K UHD
  let defaultPkg = packages.find(p => p.id === '1080p_h264')
    || packages.find(p => p.id === '1080p_hevc')
    || packages.find(p => p.id === '720p_h264')
    || packages.find(p => p.id === 'season_packs')
    || packages[0];

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
 * Search Chinese / Asian Anime & Drama torrents via Bangumi.moe & DMHY
 */
export async function searchChineseAndAsianTvTorrents(title, originalName, seasonNumber = 1) {
  const allRawEpisodes = [];
  const queryCandidates = [
    seasonNumber > 1 ? `${title} 第${seasonNumber}季` : title,
    seasonNumber > 1 ? `${title} S0${seasonNumber}` : title,
    title,
    originalName
  ].filter(Boolean);

  // 1. Bangumi.moe API Search
  for (const query of queryCandidates) {
    try {
      console.log(`[Asian TV Search]: Querying Bangumi.moe for "${query}"`);
      const res = await fetch('https://bangumi.moe/api/v2/torrent/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.torrents) {
          for (const t of data.torrents) {
            const rawTitle = t.title;
            const isPack = /合集|全集|Fin(?:al)?|S0?\d+[\s\-_]+(?:Complete|Pack)|(?:01|1)[\s\-_~～]+(\d{2,3})|Reseed|完结/i.test(rawTitle);

            let epNum = null;
            if (isPack) {
              epNum = 'Season_Pack';
            } else {
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
            }

            if (!epNum) epNum = 'Season_Pack';

            const is4k = /2160p|4k/i.test(rawTitle);
            const is1080p = /1080p|1920x1080/i.test(rawTitle) && !is4k;
            const is720p = /720p/i.test(rawTitle);
            const isHevc = /x265|hevc|h\.?265/i.test(rawTitle);
            const isH264 = (/x264|h264|h\.264|avc/i.test(rawTitle) || (!isHevc && !is4k)) && !isHevc;
            const magnet = t.magnet || `magnet:?xt=urn:btih:${t._id}&dn=${encodeURIComponent(rawTitle)}`;

            allRawEpisodes.push({
              rawTitle,
              episodeNum: epNum,
              cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
              seasonNumber,
              is4k,
              is1080p,
              is720p,
              isH264,
              isHevc,
              subtitles: parseSubtitleInfo(rawTitle),
              downloadUrl: magnet,
              sizeMb: t.size ? (t.size / (1024 * 1024)).toFixed(1) : '0',
              seeds: t.seeders || 1
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[Asian TV Search]: Bangumi.moe error with query "${query}":`, err.message);
    }
  }

  // 2. DMHY RSS Search
  for (const query of queryCandidates) {
    const url = `https://share.dmhy.org/topics/rss/rss.xml?keyword=${encodeURIComponent(query)}`;
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

          const isPack = /合集|全集|Fin(?:al)?|S0?\d+[\s\-_]+(?:Complete|Pack)|(?:01|1)[\s\-_~～]+(\d{2,3})|Reseed|完结/i.test(rawTitle);
          let epNum = null;
          if (isPack) {
            epNum = 'Season_Pack';
          } else {
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
          }

          if (!epNum) epNum = 'Season_Pack';

          const is4k = /2160p|4k/i.test(rawTitle);
          const is1080p = /1080p|1920x1080/i.test(rawTitle) && !is4k;
          const is720p = /720p/i.test(rawTitle);
          const isHevc = /x265|hevc|h\.?265/i.test(rawTitle);
          const isH264 = (/x264|h264|h\.264|avc/i.test(rawTitle) || (!isHevc && !is4k)) && !isHevc;

          allRawEpisodes.push({
            rawTitle,
            episodeNum: epNum,
            cleanEpisodeName: epNum === 'Season_Pack' ? `Season ${seasonNumber} Complete Pack` : `Episode ${epNum}`,
            seasonNumber,
            is4k,
            is1080p,
            is720p,
            isH264,
            isHevc,
            subtitles: parseSubtitleInfo(rawTitle),
            downloadUrl,
            sizeMb: '0',
            seeds: 1
          });
        }
      }
    } catch (err) {
      console.warn(`[Asian TV Search]: DMHY error with query "${query}":`, err.message);
    }
  }

  // 3. Organize all releases by episode number
  const allReleasesByEpisode = {};
  for (const ep of allRawEpisodes) {
    if (!allReleasesByEpisode[ep.episodeNum]) {
      allReleasesByEpisode[ep.episodeNum] = [];
    }
    if (!allReleasesByEpisode[ep.episodeNum].some(existing => existing.downloadUrl === ep.downloadUrl)) {
      allReleasesByEpisode[ep.episodeNum].push(ep);
    }
  }

  // Sort inside each episode: Prefer Chinese sub > 1080p > H264
  for (const epNum of Object.keys(allReleasesByEpisode)) {
    allReleasesByEpisode[epNum].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      if (a.subtitles?.isChs || a.subtitles?.isCht) scoreA += 50;
      if (b.subtitles?.isChs || b.subtitles?.isCht) scoreB += 50;
      if (a.is1080p) scoreA += 30;
      if (b.is1080p) scoreB += 30;
      if (a.isH264) scoreA += 20;
      if (b.isH264) scoreB += 20;
      return scoreB - scoreA;
    });
  }

  // Build packages
  const packages = [];
  const seasonPacks = allRawEpisodes.filter(e => e.episodeNum === 'Season_Pack');
  if (seasonPacks.length > 0) {
    packages.push({
      id: 'season_packs',
      name: '📦 Season Complete Pack',
      description: '全季完整合集包 (一键下载整季，推荐使用)',
      badge: 'SEASON PACK',
      badgeColor: 'amber',
      episodeCount: seasonPacks.length,
      totalSizeMb: seasonPacks.reduce((acc, cur) => acc + parseFloat(cur.sizeMb || '0'), 0),
      episodes: seasonPacks
    });
  }

  const individualEps = Object.entries(allReleasesByEpisode)
    .filter(([epNum]) => epNum !== 'Season_Pack')
    .map(([_, list]) => list[0])
    .sort((a, b) => a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true }));

  if (individualEps.length > 0) {
    packages.unshift({
      id: '1080p_all',
      name: '⚡ 1080p Direct-Play Package',
      description: '高清内嵌/内封中文字幕方案',
      badge: '1080p HD',
      badgeColor: 'green',
      episodeCount: individualEps.length,
      totalSizeMb: individualEps.reduce((acc, cur) => acc + parseFloat(cur.sizeMb || '0'), 0),
      episodes: individualEps
    });
  }

  const defaultEpisodes = packages.length > 0 ? packages[0].episodes : Object.values(allReleasesByEpisode).map(list => list[0]);

  return {
    success: allRawEpisodes.length > 0,
    count: defaultEpisodes.length,
    episodes: defaultEpisodes,
    packages,
    defaultPackageId: packages.length > 0 ? packages[0].id : 'default',
    allReleasesByEpisode
  };
}

/**
 * Universal Dispatcher: Search torrents for any TMDB show
 */
export async function searchUniversalMediaTorrents({ imdbId, showName, originalName, seasonNumber = 1, showType, country = [] }) {
  const isAsian = showType === 'Anime' || showType === 'Japanese' || showType === 'Chinese' || showType === 'Korean' || country.some(c => ['JP', 'CN', 'KR', 'TW', 'HK'].includes(c));
  
  if (isAsian) {
    const asianRes = await searchChineseAndAsianTvTorrents(showName, originalName, seasonNumber);
    if (asianRes.success && asianRes.episodes.length > 0) {
      return asianRes;
    }
  }

  // Western search
  const westernRes = await searchWesternTvTorrents(imdbId, originalName || showName, seasonNumber);
  if (westernRes.success && westernRes.episodes.length > 0) {
    return westernRes;
  }

  // Fallback to Asian search if Western failed
  if (!isAsian) {
    return await searchChineseAndAsianTvTorrents(showName, originalName, seasonNumber);
  }

  return westernRes;
}
