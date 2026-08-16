async function test(title, seasonNumber) {
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`APIBay for "${title}": returned ${data.length} items`);

  const seasonPattern = new RegExp(`S0?${seasonNumber}|Season\\s*0?${seasonNumber}|S0?1-0?5`, 'i');
  const matched = data.filter(t => seasonPattern.test(t.name));
  console.log(`Matched for Season ${seasonNumber}: ${matched.length} items`);
  matched.slice(0, 5).forEach(t => console.log(`  - ${t.name} (Seeds: ${t.seeders})`));
}

test('Breaking Bad', 2);
test('Game of Thrones', 1);
test('Better Call Saul', 1);
