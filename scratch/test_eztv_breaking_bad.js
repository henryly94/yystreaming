async function test(query, imdbId) {
  // Test numeric with parseInt
  const numId = parseInt(imdbId.replace('tt', ''), 10);
  const url1 = `https://eztv.re/api/get-torrents?imdb_id=${numId}&limit=100`;
  const res1 = await fetch(url1, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d1 = await res1.json();
  console.log(`imdb_id=${numId} (${url1}) -> ${d1.torrents?.length || 0} torrents`);
  if (d1.torrents?.[0]) console.log(`  1st: ${d1.torrents[0].title}`);

  // Test search string
  const url2 = `https://eztv.re/api/get-torrents?search=${encodeURIComponent(query)}&limit=100`;
  const res2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d2 = await res2.json();
  console.log(`search=${query} (${url2}) -> ${d2.torrents?.length || 0} torrents`);
  if (d2.torrents?.[0]) console.log(`  1st: ${d2.torrents[0].title}`);

  // Test pagination: page 1, page 2
  const url3 = `https://eztv.re/api/get-torrents?imdb_id=${numId}&limit=100&page=2`;
  const res3 = await fetch(url3, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d3 = await res3.json();
  console.log(`page=2 for imdb_id=${numId} -> ${d3.torrents?.length || 0} torrents`);
}

test('Breaking Bad', 'tt0903747');
