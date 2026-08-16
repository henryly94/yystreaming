async function testSearch(keyword) {
  console.log(`\nTesting search for "${keyword}"...`);
  
  // 1. DMHY
  const dmhyUrl = `https://share.dmhy.org/topics/rss/rss.xml?keyword=${encodeURIComponent(keyword)}`;
  try {
    const res = await fetch(dmhyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    const matches = [...text.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<enclosure[^>]+url=["']([^"']+)["']/gi)];
    console.log(`[DMHY] "${keyword}" -> ${matches.length} items`);
    if (matches.length > 0) {
      matches.slice(0, 3).forEach(m => console.log(`  - ${m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()}`));
    }
  } catch (e) {
    console.log(`[DMHY] error: ${e.message}`);
  }

  // 2. ACG.RIP
  const acgUrl = `https://acg.rip/1.xml?term=${encodeURIComponent(keyword)}`;
  try {
    const res = await fetch(acgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    const matches = [...text.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<enclosure[^>]+url=["']([^"']+)["']/gi)];
    console.log(`[ACG.RIP] "${keyword}" -> ${matches.length} items`);
    if (matches.length > 0) {
      matches.slice(0, 3).forEach(m => console.log(`  - ${m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()}`));
    }
  } catch (e) {
    console.log(`[ACG.RIP] error: ${e.message}`);
  }
}

async function run() {
  await testSearch('庆余年');
  await testSearch('庆余年2');
  await testSearch('三体');
  await testSearch('繁花');
  await testSearch('泪之女王');
}

run();
