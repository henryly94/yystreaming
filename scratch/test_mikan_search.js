async function testMikanSearch(keyword) {
  const searchUrl = `https://mikanani.me/Home/Search?searchstr=${encodeURIComponent(keyword)}`;
  console.log(`Searching Mikan for "${keyword}" at ${searchUrl}...`);

  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });

  const html = await res.text();
  console.log(`Received HTML (${html.length} bytes)`);

  // Extract anime cards from search results
  // In Mikan search results, anime items are listed with /Home/Bangumi/{bangumiId}
  const bangumiMatches = [...html.matchAll(/href=["']\/Home\/Bangumi\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  console.log(`Found ${bangumiMatches.length} bangumi links`);

  const shows = new Map();
  for (const m of bangumiMatches) {
    const bangumiId = m[1];
    const innerHtml = m[2];
    const titleMatch = innerHtml.match(/<div class=["']an-text["'][^>]*>([\s\S]*?)<\/div>/i) || [null, innerHtml.replace(/<[^>]+>/g, '').trim()];
    const title = titleMatch[1].trim();
    if (title && !shows.has(bangumiId)) {
      shows.set(bangumiId, { bangumiId, title });
    }
  }

  console.log('\n--- Matched Shows ---');
  for (const [id, show] of shows.entries()) {
    console.log(`ID: ${id} | Title: ${show.title}`);
  }

  // Now test fetching Bangumi page for the first show to inspect its Subgroups!
  if (shows.size > 0) {
    const firstId = [...shows.keys()][0];
    const showUrl = `https://mikanani.me/Home/Bangumi/${firstId}`;
    console.log(`\nFetching Subgroup details from ${showUrl}...`);

    const showRes = await fetch(showUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    const showHtml = await showRes.text();

    // In Mikan Bangumi page, subgroups are headers with /RSS/Bangumi?bangumiId=...&subgroupid=...
    const subgroupMatches = [...showHtml.matchAll(/href=["']\/RSS\/Bangumi\?bangumiId=(\d+)&amp;subgroupid=(\d+)["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<div class=["']subgroup-text["'][^>]*>([\s\S]*?)<\/div>/gi)];
    
    // Also extract subgroup table blocks
    console.log(`Subgroup RSS matches: ${subgroupMatches.length}`);
    
    // Alternative subgroup regex
    const subTableMatches = [...showHtml.matchAll(/class=["']subgroup-text["'][^>]*>([\s\S]*?)<\/div>/gi)];
    console.log(`Subgroup text headers: ${subTableMatches.length}`);
    subTableMatches.forEach((s, idx) => {
      console.log(`  Subgroup #${idx + 1}: ${s[1].trim()}`);
    });
  }
}

testMikanSearch('无职转生').catch(console.error);
