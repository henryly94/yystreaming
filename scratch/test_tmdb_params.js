const DEFAULT_TMDB_KEY = '41132644ff7328ff9638c4ef4e1136b6';

async function test(query) {
  // Test multi
  const url1 = `https://api.themoviedb.org/3/search/multi?api_key=${DEFAULT_TMDB_KEY}&language=zh-CN&query=${encodeURIComponent(query)}&page=1&include_adult=false`;
  const res1 = await fetch(url1);
  const d1 = await res1.json();
  console.log(`[Multi zh-CN] "${query}" -> ${d1.results?.length || 0} results`);
  if (d1.results?.[0]) console.log('  1st:', d1.results[0].name || d1.results[0].title, d1.results[0].id, d1.results[0].media_type);

  // Test search tv without language filter (TMDB default searches original/English)
  const url2 = `https://api.themoviedb.org/3/search/tv?api_key=${DEFAULT_TMDB_KEY}&query=${encodeURIComponent(query)}`;
  const res2 = await fetch(url2);
  const d2 = await res2.json();
  console.log(`[TV default] "${query}" -> ${d2.results?.length || 0} results`);
  if (d2.results?.[0]) console.log('  1st:', d2.results[0].name, d2.results[0].id);

  // Test English search
  const url3 = `https://api.themoviedb.org/3/search/tv?api_key=${DEFAULT_TMDB_KEY}&query=Stranger+Things`;
  const res3 = await fetch(url3);
  const d3 = await res3.json();
  console.log(`[TV Stranger Things] -> ${d3.results?.length || 0} results`);
  if (d3.results?.[0]) console.log('  1st:', d3.results[0].name, d3.results[0].id);
}

async function run() {
  await test('怪奇物语');
  await test('Stranger Things');
  await test('庆余年');
  await test('Joy of Life');
}

run();
