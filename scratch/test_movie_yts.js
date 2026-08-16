async function testMovieSearch(imdbId, title) {
  console.log(`\n=============================================`);
  console.log(`Testing Movie Search: "${title}" (IMDb: ${imdbId})`);
  console.log(`=============================================`);

  const url = `https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`YTS movie count: ${data.data?.movie_count || 0}`);

    if (data.data?.movies && data.data.movies.length > 0) {
      const movie = data.data.movies[0];
      console.log(`✓ Movie Match: "${movie.title_long}" (Rating: ⭐ ${movie.rating}/10, Runtime: ${movie.runtime} mins)`);
      console.log(`  Available Torrents/Qualities:`);
      movie.torrents?.forEach(t => {
        console.log(`    - [${t.quality.toUpperCase()} ${t.type.toUpperCase()}] Size: ${t.size}, Seeds: ${t.seeds}, Peers: ${t.peers}`);
        console.log(`      Magnet: magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title_long)}`);
      });
    }
  } catch (err) {
    console.error('YTS error:', err.message);
  }
}

async function run() {
  // 1. The Shawshank Redemption (肖申克的救赎 - 1994)
  await testMovieSearch('tt0111161', '肖申克的救赎 (The Shawshank Redemption)');

  // 2. The Godfather (教父 - 1972)
  await testMovieSearch('tt0068646', '教父 (The Godfather)');

  // 3. Interstellar (星际穿越 - 2014)
  await testMovieSearch('tt0816692', '星际穿越 (Interstellar)');

  // 4. Inception (盗梦空间 - 2010)
  await testMovieSearch('tt1375666', '盗梦空间 (Inception)');
}

run();
