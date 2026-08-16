const mirrors = [
  'https://yts.mx/api/v2/list_movies.json?query_term=tt0111161',
  'https://yts.pm/api/v2/list_movies.json?query_term=tt0111161',
  'https://yts.rs/api/v2/list_movies.json?query_term=tt0111161',
  'https://yts.do/api/v2/list_movies.json?query_term=tt0111161',
  'https://yts.bz/api/v2/list_movies.json?query_term=tt0111161',
  'https://yts.lt/api/v2/list_movies.json?query_term=tt0111161'
];

async function run() {
  for (const url of mirrors) {
    try {
      console.log(`Testing ${url.split('/')[2]}...`);
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        console.log(`✓ SUCCESS on ${url.split('/')[2]}: Found ${data.data?.movie_count} movies!`);
        if (data.data?.movies?.[0]) {
          console.log(`  Title: ${data.data.movies[0].title_long}`);
          console.log(`  Torrents: ${data.data.movies[0].torrents?.map(t => `${t.quality} (${t.size})`).join(', ')}`);
        }
        return;
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }
}

run();
