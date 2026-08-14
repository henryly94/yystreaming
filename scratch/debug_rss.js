import { parseRssItem, deduplicateAndFilterRssItems } from '../server/rss_parser.js';

async function testFilterFirst() {
  const url = 'https://mikanani.me/RSS/Bangumi?bangumiId=3995&subgroupid=615';
  console.log(`Fetching RSS feed from ${url}...`);
  
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });

  const xmlText = await res.text();
  const itemMatches = [...xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

  const rawItems = itemMatches.map(m => {
    const itemXml = m[1];
    const titleM = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const linkM = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
    const encM = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const pubM = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    return {
      title: titleM ? titleM[1].trim() : '',
      link: linkM ? linkM[1].trim() : '',
      enclosure: { url: encM ? encM[1].trim() : '' },
      pubDate: pubM ? pubM[1].trim() : ''
    };
  });

  console.log(`Total raw items in RSS: ${rawItems.length}`);

  console.log('\n--- 1. Default (No Filter) ---');
  const defaultEpisodes = deduplicateAndFilterRssItems(rawItems, '');
  defaultEpisodes.forEach(ep => console.log(`- Ep ${ep.episodeNum}: ${ep.rawTitle}`));

  console.log('\n--- 2. Filter Keyword: "Baha" ---');
  const bahaEpisodes = deduplicateAndFilterRssItems(rawItems, 'Baha');
  bahaEpisodes.forEach(ep => console.log(`- Ep ${ep.episodeNum}: ${ep.rawTitle}`));

  console.log('\n--- 3. Filter Keyword: "CR" ---');
  const crEpisodes = deduplicateAndFilterRssItems(rawItems, 'CR');
  crEpisodes.forEach(ep => console.log(`- Ep ${ep.episodeNum}: ${ep.rawTitle}`));
}

testFilterFirst().catch(console.error);
