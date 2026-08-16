const DEFAULT_TMDB_KEY = '41132644ff7328ff9638c4ef4e1136b6';

async function testTmdbSearch(query) {
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${DEFAULT_TMDB_KEY}&language=zh-CN&query=${encodeURIComponent(query)}`;
  console.log(`[TMDB] Searching for "${query}"...`);
  const res = await fetch(url);
  const data = await res.json();
  console.log(`[TMDB] Results count: ${data.results?.length || 0}`);
  if (data.results && data.results.length > 0) {
    const show = data.results[0];
    console.log(`  Top Show: "${show.name}" (Original: "${show.original_name}", ID: ${show.id}, Country: [${show.origin_country?.join(', ')}])`);
    
    // Fetch details with external IDs
    const detailsUrl = `https://api.themoviedb.org/3/tv/${show.id}?api_key=${DEFAULT_TMDB_KEY}&language=zh-CN&append_to_response=external_ids`;
    const detRes = await fetch(detailsUrl);
    const details = await detRes.json();
    console.log(`  IMDb ID: ${details.external_ids?.imdb_id}`);
    console.log(`  Seasons (${details.seasons?.length}):`);
    details.seasons?.forEach(s => {
      console.log(`    - ${s.name} (${s.episode_count} eps, Air Date: ${s.air_date})`);
    });
    return details;
  }
  return null;
}

async function testEztvSearch(imdbId) {
  if (!imdbId) return;
  const numericId = imdbId.replace('tt', '');
  const url = `https://eztv.re/api/get-torrents?imdb_id=${numericId}&limit=20`;
  console.log(`\n[EZTV] Fetching torrents for IMDb ID ${imdbId} (${url})...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`[EZTV] Torrents found: ${data.torrents?.length || 0}`);
    if (data.torrents && data.torrents.length > 0) {
      data.torrents.slice(0, 3).forEach(t => {
        console.log(`  - [S${t.season}E${t.episode}] ${t.title} (${(t.size_bytes / (1024*1024)).toFixed(1)} MB, Seeds: ${t.seeds})`);
      });
    }
  } catch (err) {
    console.error('[EZTV] Error:', err.message);
  }
}

async function run() {
  console.log('=== Test 1: Western Show "怪奇物语" (Stranger Things) ===');
  const western = await testTmdbSearch('怪奇物语');
  if (western?.external_ids?.imdb_id) {
    await testEztvSearch(western.external_ids.imdb_id);
  }

  console.log('\n=== Test 2: Chinese Drama "庆余年" (Joy of Life) ===');
  await testTmdbSearch('庆余年');

  console.log('\n=== Test 3: Korean Drama "泪之女王" (Queen of Tears) ===');
  await testTmdbSearch('泪之女王');
}

run().catch(console.error);
