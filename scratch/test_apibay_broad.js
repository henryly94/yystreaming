async function test(q) {
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`APIBay "${q}" -> ${data.length} torrents`);
  if (data[0] && data[0].name !== 'No results returned') {
    data.slice(0, 5).forEach(t => console.log(`  - ${t.name} (Seeds: ${t.seeders})`));
  }
}

async function run() {
  await test('Breaking Bad');
  await test('Breaking Bad Season 2');
}

run();
