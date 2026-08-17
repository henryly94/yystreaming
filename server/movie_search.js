// Multi-Channel Movie Torrent Search Engine (YTS + APIBay + DMHY)
import { parseSubtitleInfo } from './tv_search.js';

const YTS_MIRRORS = [
  'https://yts.bz',
  'https://yts.pm',
  'https://yts.rs',
  'https://yts.do',
  'https://yts.mx'
];

/**
 * Search movies using YTS official JSON API across multiple working mirrors
 */
async function searchYts(queryOrImdbId) {
  for (const mirror of YTS_MIRRORS) {
    const url = `${mirror}/api/v2/list_movies.json?query_term=${encodeURIComponent(queryOrImdbId)}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.movies && data.data.movies.length > 0) {
          return data.data.movies[0];
        }
      }
    } catch (e) {
      // Try next mirror
    }
  }
  return null;
}

/**
 * Search movies on APIBay
 */
async function searchApiBayMovies(title, year) {
  const q = year ? `${title} ${year}` : title;
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=200`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].name !== 'No results returned') {
        return data;
      }
    }
  } catch (e) {}
  return [];
}

/**
 * Search Chinese-subtitled movies on DMHY
 */
async function searchDmhyMovies(title) {
  if (!title) return [];
  const url = `https://share.dmhy.org/topics/rss/rss.xml?keyword=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemMatches = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<enclosure[^>]+url=["']([^"']+)["']/gi)];
    const results = [];
    for (const m of itemMatches.slice(0, 10)) {
      const rawTitle = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const downloadUrl = m[2].trim();
      results.push({ name: rawTitle, downloadUrl });
    }
    return results;
  } catch (e) {
    return [];
  }
}

/**
 * Main Movie Search Dispatcher
 */
export async function searchMovieTorrents({ imdbId, title, originalTitle, year }) {
  const releases = [];

  // 1. Primary: Query YTS by IMDb ID or English title
  const ytsQuery = imdbId || originalTitle || title;
  const ytsMovie = await searchYts(ytsQuery);

  if (ytsMovie && ytsMovie.torrents) {
    for (const t of ytsMovie.torrents) {
      const qual = t.quality.toUpperCase();
      const type = (t.type || 'BluRay').toUpperCase();
      const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(`${ytsMovie.title_long} [${qual}] [YTS]`)}`;
      
      releases.push({
        name: `${ytsMovie.title_long} [${qual} ${type}]`,
        quality: qual,
        type,
        is1080p: qual === '1080P',
        is720p: qual === '720P',
        is4k: qual === '2160P' || qual === '4K',
        isH264: true, // YTS is 100% MP4 H.264 Direct-Play
        size: t.size,
        sizeBytes: t.size_bytes,
        seeds: t.seeds || 0,
        peers: t.peers || 0,
        downloadUrl: magnet,
        source: 'YTS',
        subtitles: {
          isEng: true,
          isChs: false,
          isCht: false,
          badges: [{ code: 'eng', label: '🇺🇸 英文', color: 'blue' }]
        }
      });
    }
  }

  // 2. Query Chinese / Asian releases on DMHY if Chinese title exists
  if (title) {
    const dmhyResults = await searchDmhyMovies(title);
    for (const item of dmhyResults) {
      const is1080p = /1080p|1920x1080/i.test(item.name);
      const is720p = /720p|1280x720/i.test(item.name);
      const is4k = /2160p|4k/i.test(item.name);
      const qual = is4k ? '2160P' : is1080p ? '1080P' : is720p ? '720P' : 'HD';
      const subInfo = parseSubtitleInfo(item.name);

      releases.push({
        name: item.name,
        quality: qual,
        type: 'DMHY-Fansub',
        is1080p,
        is720p,
        is4k,
        isH264: /x264|h\.?264|avc/i.test(item.name),
        size: '1.5 - 4.0 GB',
        sizeBytes: 0,
        seeds: 5,
        peers: 2,
        downloadUrl: item.downloadUrl,
        source: 'DMHY',
        subtitles: subInfo
      });
    }
  }

  // 3. Secondary: Query APIBay
  if (originalTitle || title) {
    const apibayResults = await searchApiBayMovies(originalTitle || title, year);
    for (const t of apibayResults.slice(0, 10)) {
      const sizeMb = (parseInt(t.size, 10) / (1024 * 1024)).toFixed(1);
      const is1080p = /1080p/i.test(t.name);
      const is720p = /720p/i.test(t.name);
      const is4k = /2160p|4k/i.test(t.name);
      const qual = is4k ? '2160P' : is1080p ? '1080P' : is720p ? '720P' : 'HD';
      const magnet = `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}`;
      const subInfo = parseSubtitleInfo(t.name);

      releases.push({
        name: t.name,
        quality: qual,
        type: /bluray|bdrip/i.test(t.name) ? 'BLURAY' : 'WEB-DL',
        is1080p,
        is720p,
        is4k,
        isH264: /x264|h\.?264|avc/i.test(t.name),
        size: parseFloat(sizeMb) > 1024 ? `${(parseFloat(sizeMb)/1024).toFixed(2)} GB` : `${sizeMb} MB`,
        sizeBytes: parseInt(t.size, 10),
        seeds: parseInt(t.seeders, 10) || 0,
        peers: parseInt(t.leechers, 10) || 0,
        downloadUrl: magnet,
        source: 'APIBay',
        subtitles: subInfo
      });
    }
  }

  // Sort releases: Chinese subs / 1080p > 720p > 4K
  releases.sort((a, b) => {
    const getScore = (item) => {
      let s = 0;
      if (item.subtitles?.isChs || item.subtitles?.isCht) s += 50;
      if (item.is1080p) s += 100;
      else if (item.is720p) s += 80;
      else if (item.is4k) s += 40;
      else s += 50;

      if (item.isH264) s += 10;
      s += Math.min(item.seeds || 0, 30);
      return s;
    };
    return getScore(b) - getScore(a);
  });

  return {
    success: true,
    count: releases.length,
    releases
  };
}
