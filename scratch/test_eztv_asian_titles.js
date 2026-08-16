async function searchEztvByTitle(title) {
  const url = `https://eztv.re/api/get-torrents?search=${encodeURIComponent(title)}&limit=10`;
  console.log(`\nSearching EZTV for "${title}"...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    console.log(`Results: ${data.torrents?.length || 0}`);
    if (data.torrents?.length > 0) {
      data.torrents.slice(0, 3).forEach(t => console.log(`  - [S${t.season}E${t.episode}] ${t.title}`));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

async function run() {
  await searchEztvByTitle('Queen of Tears');
  await searchEztvByTitle('Joy of Life');
  await searchEztvByTitle('Squid Game');
  await searchEztvByTitle('Shogun');
  await searchEztvByTitle('3 Body Problem');
  await searchEztvByTitle('The Last of Us');
}

run();
