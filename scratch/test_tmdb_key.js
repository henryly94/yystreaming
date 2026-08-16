async function testKey(key) {
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=Breaking+Bad`;
  const res = await fetch(url);
  console.log(`Key ${key.slice(0, 6)}... Status: ${res.status}`);
  const text = await res.text();
  console.log(`Response: ${text.slice(0, 200)}`);
}

async function run() {
  await testKey('41132644ff7328ff9638c4ef4e1136b6');
  // Test TMDB standard demo / open keys from open-source apps
  await testKey('1bfb17231401568252266ecaa202e6e3');
  await testKey('b6fbc7f4746614104c12fc83877329f8');
  await testKey('f494f4c8b939f50ef2562479e0a0d4c8');
}

run();
