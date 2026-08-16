import { getTmdbShowDetails, searchTmdb } from '../server/tmdb.js';
import { searchWesternTvTorrents } from '../server/tv_search.js';

async function debugBreakingBad() {
  console.log('--- Step 1: TMDB Details for Breaking Bad ---');
  const search = await searchTmdb('Breaking Bad');
  console.log('Search results:', search.length);
  const bb = search[0];
  console.log('Top match:', bb.name, 'ID:', bb.id);

  const details = await getTmdbShowDetails(bb.id);
  console.log('IMDb ID:', details.imdbId);
  console.log('Seasons in TMDB:', details.seasons.length);
  details.seasons.forEach(s => console.log(`  - ${s.name}: ${s.episodeCount} eps`));

  console.log('\n--- Step 2: EZTV Torrents for Breaking Bad Season 2 ---');
  const numericId = details.imdbId.replace('tt', '');
  console.log(`Querying EZTV with numericId: ${numericId} and 'Breaking Bad'`);

  const url1 = `https://eztv.re/api/get-torrents?imdb_id=${numericId}&limit=100`;
  const res1 = await fetch(url1, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d1 = await res1.json();
  console.log(`EZTV by imdb_id (${numericId}): total torrents = ${d1.torrents?.length || 0}`);
  
  if (d1.torrents) {
    const s2 = d1.torrents.filter(t => parseInt(t.season, 10) === 2);
    console.log(`Season 2 torrents in this page: ${s2.length}`);
    s2.forEach(t => console.log(`  [S${t.season}E${t.episode}] ${t.title}`));
    console.log('\nPage metadata:', { page: d1.page, limit: d1.limit, torrents_count: d1.torrents_count });
  }

  console.log('\n--- Step 3: Our tv_search.js result for Season 2 ---');
  const result = await searchWesternTvTorrents(details.imdbId, 'Breaking Bad', 2);
  console.log(`Result episodes count: ${result.episodes.length}`);
  result.episodes.forEach(e => console.log(`  EP ${e.episodeNum}: ${e.cleanEpisodeName} -> ${e.rawTitle}`));
}

debugBreakingBad().catch(console.error);
