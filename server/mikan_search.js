// Mikan Project Anime Search & Subgroup Extractor

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 1. Search Anime list by keyword
export async function searchMikanAnime(keyword) {
  if (!keyword || !keyword.trim()) return [];

  const searchUrl = `https://mikanani.me/Home/Search?searchstr=${encodeURIComponent(keyword.trim())}`;
  console.log(`[Mikan Search]: Fetching search results for '${keyword.trim()}' from ${searchUrl}`);

  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      console.error(`[Mikan Search]: Search HTTP error: status ${res.status}`);
      return [];
    }

    const html = await res.text();
    const items = [];
    const cardRegex = /<li[^>]*>[\s\S]*?<a\s+href=["']\/Home\/Bangumi\/(\d+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const bangumiId = match[1];
      const inner = match[2];

      const titleMatch = inner.match(/<div\s+class=["']an-text["'][^>]*title=["']([^"']+)["']/i) ||
                         inner.match(/<div\s+class=["']an-text["'][^>]*>([\s\S]*?)<\/div>/i);
      const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `Bangumi ${bangumiId}`;
      const title = decodeHtmlEntities(rawTitle);

      const imgMatch = inner.match(/data-src=["']([^"']+)["']/i) ||
                       inner.match(/src=["']([^"']+)["']/i) ||
                       inner.match(/background-image:\s*url\((?:["']?)([^"')]+)/i);
      let poster = imgMatch ? imgMatch[1].trim() : '';
      if (poster && !poster.startsWith('http')) {
        poster = `https://mikanani.me${poster}`;
      }

      if (!items.some(it => it.bangumiId === bangumiId)) {
        items.push({
          bangumiId,
          title,
          poster: poster || `https://mikanani.me/images/Bangumi/${bangumiId}.jpg`
        });
      }
    }

    console.log(`[Mikan Search]: Found ${items.length} anime results for '${keyword}'`);
    return items;
  } catch (err) {
    console.error('[Mikan Search]: Error searching Mikan:', err.message);
    return [];
  }
}

// 2. Fetch Bangumi details and all Subgroup entries with feature fingerprints
export async function getMikanBangumiDetails(bangumiId) {
  if (!bangumiId) return null;

  const bgmUrl = `https://mikanani.me/Home/Bangumi/${bangumiId}`;
  console.log(`[Mikan Bangumi]: Fetching details for Bangumi ID ${bangumiId} from ${bgmUrl}`);

  try {
    const res = await fetch(bgmUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      console.error(`[Mikan Bangumi]: HTTP error: status ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Extract Show Title
    const titleMatch = html.match(/<p\s+class=["']bangumi-title["'][^>]*>([\s\S]*?)<\/p>/i) ||
                       html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `Bangumi ${bangumiId}`;
    const showTitle = decodeHtmlEntities(rawTitle);

    // Extract Poster
    const posterMatch = html.match(/<div\s+class=["']bangumi-poster["'][^>]*background-image:\s*url\((?:["']?)([^"')]+)/i) ||
                        html.match(/<div\s+class=["']bangumi-poster["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    let poster = posterMatch ? posterMatch[1].trim() : '';
    if (poster && !poster.startsWith('http')) {
      poster = `https://mikanani.me${poster}`;
    }

    // Split HTML by subgroup headers
    const subgroupBlocks = html.split(/(?=<div[^>]+class=["']subgroup-text)/i);
    const subgroups = [];

    for (const block of subgroupBlocks) {
      const rssMatch = block.match(/href=["']\/RSS\/Bangumi\?bangumiId=(\d+)&(?:amp;)?subgroupid=(\d+)["']/i);
      if (!rssMatch) continue;

      const subgroupId = rssMatch[2];
      const nameMatch = block.match(/<a\s+href=["']\/Home\/PublishGroup\/\d+["'][^>]*>([\s\S]*?)<\/a>/i) ||
                        block.match(/class=["']subgroup-text["'][^>]*>([\s\S]*?)<\/div>/i);
      const rawName = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : `Subgroup ${subgroupId}`;
      const subgroupName = decodeHtmlEntities(rawName);

      // Extract sample release titles from table rows inside this block
      const titleMatches = [...block.matchAll(/class=["']magnet-link-wrap["'][^>]*>([\s\S]*?)<\/a>/gi)];
      const sampleTitles = titleMatches.map(tm => decodeHtmlEntities(tm[1].replace(/<[^>]+>/g, '').trim())).slice(0, 15);

      // Feature tag detection & fingerprinting
      const allTitlesStr = sampleTitles.join(' ');
      const tags = [];
      const presets = [];

      if (/1080p|1920x1080/i.test(allTitlesStr)) tags.push('1080P');
      if (/720p|1280x720/i.test(allTitlesStr)) tags.push('720P');
      if (/4k|2160p/i.test(allTitlesStr)) tags.push('4K');

      if (/简繁内封|内封/i.test(allTitlesStr)) {
        tags.push('简繁内封');
        presets.push('简繁内封');
      }
      if (/简体内嵌|简中|CHS|GB_CN/i.test(allTitlesStr)) {
        tags.push('简体内嵌');
        if (!presets.includes('简繁内封')) presets.push('简体内嵌');
      }
      if (/繁体内嵌|繁中|CHT|BIG5/i.test(allTitlesStr)) tags.push('繁体内嵌');

      if (/Baha|巴哈/i.test(allTitlesStr)) {
        tags.push('Baha');
        presets.push('Baha');
      }
      if (/\bCR\b|Crunchyroll/i.test(allTitlesStr)) {
        tags.push('CR');
        presets.push('CR');
      }
      if (/ABEMA/i.test(allTitlesStr)) {
        tags.push('ABEMA');
        presets.push('ABEMA');
      }
      if (/MP4/i.test(allTitlesStr)) tags.push('MP4');
      if (/MKV/i.test(allTitlesStr)) tags.push('MKV');

      subgroups.push({
        subgroupId,
        subgroupName,
        rssUrl: `https://mikanani.me/RSS/Bangumi?bangumiId=${bangumiId}&subgroupid=${subgroupId}`,
        tags,
        recommendedPresets: presets.length > 0 ? presets : (tags.includes('1080P') ? ['1080P'] : []),
        sampleCount: sampleTitles.length,
        latestRelease: sampleTitles[0] || ''
      });
    }

    return {
      bangumiId,
      showTitle,
      poster: poster || `https://mikanani.me/images/Bangumi/${bangumiId}.jpg`,
      subgroupsCount: subgroups.length,
      subgroups
    };
  } catch (err) {
    console.error(`[Mikan Bangumi]: Error fetching details for ${bangumiId}:`, err.message);
    return null;
  }
}
