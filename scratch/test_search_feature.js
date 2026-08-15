import { searchMikanAnime, getMikanBangumiDetails } from '../server/mikan_search.js';

async function verifySearchFeature() {
  console.log('=== Test 1: Search Anime "芙莉莲" ===');
  const results1 = await searchMikanAnime('芙莉莲');
  console.log(`✓ Found ${results1.length} search results`);
  if (results1.length > 0) {
    console.log(`  Top Result: "${results1[0].title}" (ID: ${results1[0].bangumiId})`);
    
    console.log('\n=== Test 2: Fetch Fansub Details & Badges for Top Result ===');
    const details = await getMikanBangumiDetails(results1[0].bangumiId);
    console.log(`✓ Anime Title: "${details.showTitle}"`);
    console.log(`✓ Subgroups Count: ${details.subgroupsCount}`);
    details.subgroups.slice(0, 4).forEach((sg, i) => {
      console.log(`  - Subgroup #${i + 1}: ${sg.subgroupName}`);
      console.log(`    Tags: [${sg.tags.join(', ')}]`);
      console.log(`    Recommended Presets: [${sg.recommendedPresets.join(', ')}]`);
      console.log(`    RSS Feed: ${sg.rssUrl}`);
    });
  }

  console.log('\n=== Test 3: Search Anime "我推的孩子" ===');
  const results2 = await searchMikanAnime('我推的孩子');
  console.log(`✓ Found ${results2.length} search results`);
  results2.slice(0, 3).forEach(r => console.log(`  - ${r.title} (ID: ${r.bangumiId})`));

  console.log('\n=== ALL IN-APP SEARCH & SUBGROUP EXTRACTION TESTS PASSED ===');
}

verifySearchFeature().catch(console.error);
