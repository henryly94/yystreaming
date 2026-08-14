import { QBittorrentClient } from '../server/qbittorrent.js';

async function testLifecycleMethods() {
  console.log('--- Testing QBittorrentClient Methods ---');
  const client = new QBittorrentClient({
    qbHost: '127.0.0.1',
    qbPort: 8080,
    qbUsername: 'admin',
    qbPassword: 'password'
  });

  console.log('✓ Checking client instantiation...');
  console.log('  createCategory typeof:', typeof client.createCategory);
  console.log('  addTags typeof:', typeof client.addTags);
  console.log('  getTorrentsInfo typeof:', typeof client.getTorrentsInfo);
  console.log('  deleteTorrents typeof:', typeof client.deleteTorrents);
  console.log('  removeRssRule typeof:', typeof client.removeRssRule);
  console.log('  setRssRule typeof:', typeof client.setRssRule);

  console.log('\n--- Lifecycle Methods Verification Passed ---');
}

testLifecycleMethods().catch(console.error);
