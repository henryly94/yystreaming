import { searchWesternTvTorrents } from '../server/tv_search.js';

async function test() {
  console.log('Testing Breaking Bad Season 2 with title verification and fallback...');
  // Query with title check
  const res = await searchWesternTvTorrents('tt0903747', 'Breaking Bad', 2);
  console.log('Result:', res);
}

test();
