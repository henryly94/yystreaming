const keys = [
  '3bb33f78994511ef932690d56561cf02',
  '3fd2be6f0c70a2a598f084ddfb75487c', // TMDB official example key
  '8476a7ab80ad76f0936744df0430e67c',
  '2c8c4f90119b9945df33d98cf7776ec0',
  'e659b8705f4194091a1be2e6bd64b8e3',
  'a3ff27f4955c4d68e498c4b14d23253b',
  '4e44d9029b1270a757cddc766a1bcb63',
  '9f9ba8798bfd1ad3b8a1c9053fa282d8',
  'cc22904e5781a7fdc1cc3db63cc84650'
];

async function run() {
  for (const k of keys) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${k}&query=Breaking+Bad`);
      if (res.ok) {
        const d = await res.json();
        console.log(`FOUND VALID KEY: ${k} (Results: ${d.results?.length})`);
        return;
      }
    } catch (e) {}
  }
  console.log('No valid key found in list');
}

run();
