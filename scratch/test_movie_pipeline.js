const TMDB_DEFAULT_KEY = '3fd2be6f0c70a2a598f084ddfb75487c';

async function testMoviePipeline() {
  console.log('--- Step 1: Search TMDB for "007" ---');
  const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_DEFAULT_KEY}&query=007&language=zh-CN`;
  const res1 = await fetch(searchUrl);
  const data1 = await res1.json();
  
  const movies = data1.results.filter(r => r.media_type === 'movie');
  console.log(`Found ${movies.length} movies for "007":`);
  movies.slice(0, 5).forEach(m => {
    console.log(`  - [ID: ${m.id}] ${m.title} (${m.release_date?.slice(0,4)}) [Original: ${m.original_title}]`);
  });

  const casinoRoyale = movies.find(m => m.original_title === 'Casino Royale' || m.title.includes('皇家赌场'));
  if (!casinoRoyale) return;

  console.log(`\n--- Step 2: Get Movie Details for ID ${casinoRoyale.id} (${casinoRoyale.title}) ---`);
  const detailsUrl = `https://api.themoviedb.org/3/movie/${casinoRoyale.id}?api_key=${TMDB_DEFAULT_KEY}&language=zh-CN&append_to_response=external_ids`;
  const res2 = await fetch(detailsUrl);
  const movieDetails = await res2.json();

  console.log(`Title: ${movieDetails.title}`);
  console.log(`IMDb ID: ${movieDetails.external_ids?.imdb_id}`);
  console.log(`Runtime: ${movieDetails.runtime} mins`);
  console.log(`Overview: ${movieDetails.overview?.slice(0, 100)}...`);

  console.log(`\n--- Step 3: Fetch Torrents from YTS for IMDb ${movieDetails.external_ids?.imdb_id} ---`);
  const imdbId = movieDetails.external_ids?.imdb_id;
  const ytsUrl = `https://yts.bz/api/v2/list_movies.json?query_term=${imdbId}`;
  const res3 = await fetch(ytsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const ytsData = await res3.json();

  if (ytsData.data?.movies?.[0]) {
    const ytsMovie = ytsData.data.movies[0];
    console.log(`✓ YTS Match: "${ytsMovie.title_long}" (Rating: ⭐ ${ytsMovie.rating})`);
    ytsMovie.torrents?.forEach(t => {
      console.log(`  - [${t.quality.toUpperCase()} ${t.type.toUpperCase()}] Size: ${t.size}, Seeds: ${t.seeds}`);
      console.log(`    Magnet: magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(ytsMovie.title_long)}`);
    });
  }
}

testMoviePipeline().catch(console.error);
