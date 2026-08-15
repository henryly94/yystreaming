async function testExtractor() {
  const keyword = '无职转生';
  const searchUrl = `https://mikanani.me/Home/Search?searchstr=${encodeURIComponent(keyword)}`;
  console.log(`[1] Searching Mikan for "${keyword}"...`);
  const res = await fetch(searchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.text();

  // Parse anime items
  const items = [];
  const cardRegex = /<li[^>]*>[\s\S]*?<a\s+href=["']\/Home\/Bangumi\/(\d+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const bangumiId = match[1];
    const inner = match[2];

    const titleMatch = inner.match(/<div\s+class=["']an-text["'][^>]*title=["']([^"']+)["']/i) ||
                       inner.match(/<div\s+class=["']an-text["'][^>]*>([\s\S]*?)<\/div>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `Bangumi ${bangumiId}`;

    const imgMatch = inner.match(/data-src=["']([^"']+)["']/i) ||
                     inner.match(/src=["']([^"']+)["']/i) ||
                     inner.match(/background-image:\s*url\((?:["']?)([^"')]+)/i);
    let poster = imgMatch ? imgMatch[1].trim() : '';
    if (poster && !poster.startsWith('http')) {
      poster = `https://mikanani.me${poster}`;
    }

    if (!items.some(it => it.bangumiId === bangumiId)) {
      items.push({ bangumiId, title, poster });
    }
  }

  console.log(`Extracted ${items.length} anime cards from search.`);
  items.slice(0, 3).forEach(it => console.log(`  - [ID: ${it.bangumiId}] ${it.title} (Poster: ${it.poster})`));

  if (items.length > 0) {
    const target = items[0];
    console.log(`\n[2] Extracting Subgroup details for Bangumi ID ${target.bangumiId}...`);
    const bgmUrl = `https://mikanani.me/Home/Bangumi/${target.bangumiId}`;
    const bgmRes = await fetch(bgmUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const bgmHtml = await bgmRes.text();

    // Subgroups in Mikan Bangumi Page are organized by class "subgroup-text" or table blocks
    // Split HTML by subgroup-text containers
    const subgroupBlocks = bgmHtml.split(/(?=<div[^>]+class=["']subgroup-text)/i);
    const subgroups = [];

    for (const block of subgroupBlocks) {
      const rssMatch = block.match(/href=["']\/RSS\/Bangumi\?bangumiId=(\d+)&(?:amp;)?subgroupid=(\d+)["']/i);
      if (!rssMatch) continue;

      const subgroupId = rssMatch[2];
      const nameMatch = block.match(/<a\s+href=["']\/Home\/PublishGroup\/\d+["'][^>]*>([\s\S]*?)<\/a>/i) ||
                        block.match(/class=["']subgroup-text["'][^>]*>([\s\S]*?)<\/div>/i);
      const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : `Subgroup ${subgroupId}`;

      // Extract sample release titles from table rows inside this block
      const titleMatches = [...block.matchAll(/class=["']magnet-link-wrap["'][^>]*>([\s\S]*?)<\/a>/gi)];
      const sampleTitles = titleMatches.map(tm => tm[1].replace(/<[^>]+>/g, '').trim()).slice(0, 10);

      // Feature tag detection
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
        subgroupName: name,
        rssUrl: `https://mikanani.me/RSS/Bangumi?bangumiId=${target.bangumiId}&subgroupid=${subgroupId}`,
        tags,
        recommendedPresets: presets.length > 0 ? presets : (tags.includes('1080P') ? ['1080P'] : []),
        sampleCount: sampleTitles.length,
        latestRelease: sampleTitles[0] || ''
      });
    }

    console.log(`Extracted ${subgroups.length} fansub groups with feature fingerprints:`);
    subgroups.forEach((sg, idx) => {
      console.log(`  #${idx + 1} [${sg.subgroupName}] (ID: ${sg.subgroupId})`);
      console.log(`     Tags: [${sg.tags.join(', ')}]`);
      console.log(`     Presets: [${sg.recommendedPresets.join(', ')}]`);
      console.log(`     RSS: ${sg.rssUrl}`);
      console.log(`     Latest: ${sg.latestRelease.slice(0, 60)}...`);
    });
  }
}

testExtractor().catch(console.error);
