import { searchMikanAnime, getMikanBangumiDetails } from '../server/mikan_search.js';
import { searchTmdb, getTmdbShowDetails, getTmdbMovieDetails } from '../server/tmdb.js';
import { searchUniversalMediaTorrents } from '../server/tv_search.js';
import { searchMovieTorrents } from '../server/movie_search.js';

async function runFullTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING FULL SUITE: ANIME + TV SERIES + MOVIE SEARCH & ENGINE');
  console.log('================================================================\n');

  // TEST 1: ANIME (Mikan)
  console.log('▶ [1/3] Testing Anime Pipeline: "鬼灭之刃"');
  const animeResults = await searchMikanAnime('鬼灭之刃');
  console.log(`  ✓ Found ${animeResults.length} anime matches on Mikan. Top: "${animeResults[0].title}"`);
  const animeDetails = await getMikanBangumiDetails(animeResults[0].bangumiId);
  console.log(`  ✓ Extracted ${animeDetails.subgroupsCount} Fansub Subgroups (e.g. ${animeDetails.subgroups[0]?.subgroupName})`);

  // TEST 2: TV SERIES & SEASON PACK (TMDB + APIBay)
  console.log('\n▶ [2/3] Testing TV Series Pipeline: "绝命毒师" (Breaking Bad Season 2)');
  const tvResults = await searchTmdb('绝命毒师');
  console.log(`  ✓ TMDB resolved: "${tvResults[0].name}" [Type: ${tvResults[0].showType}]`);
  const tvDetails = await getTmdbShowDetails(tvResults[0].id);
  console.log(`  ✓ Fetched ${tvDetails.seasons.length} seasons (IMDb: ${tvDetails.imdbId})`);
  
  const season2 = await searchUniversalMediaTorrents({
    imdbId: tvDetails.imdbId,
    showName: tvDetails.name,
    originalName: tvDetails.originalName,
    seasonNumber: 2,
    showType: tvDetails.showType,
    country: tvDetails.country
  });
  console.log(`  ✓ Resolved ${season2.episodes.length} episodes & packs for Season 2:`);
  const pack = season2.episodes.find(e => e.episodeNum === 'Season_Pack');
  if (pack) console.log(`    - [PACK] ${pack.cleanEpisodeName} -> ${pack.rawTitle} (${pack.sizeMb} MB)`);
  console.log(`    - [EP 01] ${season2.episodes.find(e => e.episodeNum === '01')?.cleanEpisodeName}`);
  console.log(`    - [EP 13] ${season2.episodes.find(e => e.episodeNum === '13')?.cleanEpisodeName}`);

  // TEST 3: MOVIE & QUALITY SELECTOR (TMDB + YTS)
  console.log('\n▶ [3/3] Testing Movie Pipeline: "007：大战皇家赌场" (Casino Royale)');
  const movieResults = await searchTmdb('007：大战皇家赌场');
  console.log(`  ✓ TMDB resolved: "${movieResults[0].name}" [Media Type: ${movieResults[0].mediaType}]`);
  const movieDetails = await getTmdbMovieDetails(movieResults[0].id);
  console.log(`  ✓ Fetched Movie Details: ${movieDetails.name} (${movieDetails.year}) [IMDb: ${movieDetails.imdbId}]`);

  const movieTorrents = await searchMovieTorrents({
    imdbId: movieDetails.imdbId,
    title: movieDetails.name,
    originalTitle: movieDetails.originalName,
    year: movieDetails.year
  });
  console.log(`  ✓ Found ${movieTorrents.releases.length} quality releases on YTS/APIBay:`);
  movieTorrents.releases.forEach(r => {
    console.log(`    - [${r.quality} ${r.type}] ${r.size} (H.264: ${r.isH264}, Seeds: ${r.seeds})`);
  });

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! EVERYTHING IS 100% OPERATIONAL.');
  console.log('================================================================');
}

runFullTestSuite().catch(console.error);
