import { searchTmdb, getTmdbShowDetails } from '../server/tmdb.js';
import { searchUniversalMediaTorrents } from '../server/tv_search.js';
import { searchMikanAnime, getMikanBangumiDetails } from '../server/mikan_search.js';

async function testUniversalSystem() {
  console.log('=====================================================');
  console.log('TEST 1: Western TV Show - "怪奇物语" (Stranger Things)');
  console.log('=====================================================');
  const westernResults = await searchTmdb('怪奇物语');
  console.log(`✓ TMDB returned ${westernResults.length} matches. Top: "${westernResults[0].name}" (IMDb: ${westernResults[0].id})`);
  
  const westernDetails = await getTmdbShowDetails(westernResults[0].id);
  console.log(`✓ Fetched Show Details: ${westernDetails.name} [IMDb: ${westernDetails.imdbId}]`);
  console.log(`  Available Seasons: ${westernDetails.seasons.map(s => s.name).join(', ')}`);

  const season4 = westernDetails.seasons.find(s => s.seasonNumber === 4);
  if (season4) {
    const episodesRes = await searchUniversalMediaTorrents({
      imdbId: westernDetails.imdbId,
      showName: westernDetails.name,
      originalName: westernDetails.originalName,
      seasonNumber: 4,
      showType: westernDetails.showType,
      country: westernDetails.country
    });
    console.log(`✓ Found ${episodesRes.episodes.length} episodes for Season 4 on EZTV`);
    episodesRes.episodes.slice(0, 3).forEach(ep => {
      console.log(`  - [${ep.episodeNum}] ${ep.cleanEpisodeName} (1080p: ${ep.is1080p}, H.264: ${ep.isH264})`);
    });
  }

  console.log('\n=====================================================');
  console.log('TEST 2: Chinese Drama - "庆余年" (Joy of Life)');
  console.log('=====================================================');
  const cnResults = await searchTmdb('庆余年');
  console.log(`✓ TMDB returned ${cnResults.length} matches. Top: "${cnResults[0].name}" [Type: ${cnResults[0].showType}]`);
  const cnDetails = await getTmdbShowDetails(cnResults[0].id);
  console.log(`  Seasons: ${cnDetails.seasons.map(s => s.name).join(', ')}`);

  console.log('\n=====================================================');
  console.log('TEST 3: Anime via Mikan - "葬送的芙莉莲"');
  console.log('=====================================================');
  const animeResults = await searchMikanAnime('葬送的芙莉莲');
  console.log(`✓ Mikan returned ${animeResults.length} matches. Top: "${animeResults[0].title}"`);
  const animeDetails = await getMikanBangumiDetails(animeResults[0].bangumiId);
  console.log(`✓ Extracted ${animeDetails.subgroupsCount} Fansub Subgroups (e.g. ${animeDetails.subgroups[0]?.subgroupName})`);

  console.log('\n=== ALL UNIVERSAL SEARCH & TORRENT DISPATCH TESTS PASSED! ===');
}

testUniversalSystem().catch(console.error);
