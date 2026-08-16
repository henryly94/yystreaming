import fs from 'fs';
import path from 'path';

const mockRoot = path.resolve('./scratch/mock_media_disk');

// Set up mock directory hierarchy
fs.mkdirSync(path.join(mockRoot, 'Movies/007：大战皇家赌场 (2006)'), { recursive: true });
fs.writeFileSync(path.join(mockRoot, 'Movies/007：大战皇家赌场 (2006)/007.mp4'), 'dummy');
fs.writeFileSync(path.join(mockRoot, 'Movies/007：大战皇家赌场 (2006)/poster.jpg'), 'dummy');

fs.mkdirSync(path.join(mockRoot, 'Movies/肖申克的救赎 (1994)'), { recursive: true });
fs.writeFileSync(path.join(mockRoot, 'Movies/肖申克的救赎 (1994)/shawshank.mp4'), 'dummy');

fs.mkdirSync(path.join(mockRoot, 'TV/Western/绝命毒师 S02'), { recursive: true });
fs.writeFileSync(path.join(mockRoot, 'TV/Western/绝命毒师 S02/BB_S02E01.mp4'), 'dummy');
fs.writeFileSync(path.join(mockRoot, 'TV/Western/绝命毒师 S02/BB_S02E02.mp4'), 'dummy');

fs.mkdirSync(path.join(mockRoot, 'Anime/葬送的芙莉莲'), { recursive: true });
fs.writeFileSync(path.join(mockRoot, 'Anime/葬送的芙莉莲/EP01.mp4'), 'dummy');

fs.mkdirSync(path.join(mockRoot, '鬼灭之刃 刀匠村篇'), { recursive: true });
fs.writeFileSync(path.join(mockRoot, '鬼灭之刃 刀匠村篇/EP01.mp4'), 'dummy');

function discoverShowDirectories(videoDir) {
  const showsToScan = [];
  const entries = fs.readdirSync(videoDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nameLower = entry.name.toLowerCase();

    if (nameLower === 'movies' || nameLower === 'movie') {
      const movieDir = path.join(videoDir, entry.name);
      const movieEntries = fs.readdirSync(movieDir, { withFileTypes: true });
      for (const mEntry of movieEntries) {
        if (mEntry.isDirectory()) {
          showsToScan.push({
            relPath: path.posix.join(entry.name, mEntry.name),
            name: mEntry.name,
            type: 'movie'
          });
        }
      }
    } else if (nameLower === 'tv') {
      const tvDir = path.join(videoDir, entry.name);
      const tvEntries = fs.readdirSync(tvDir, { withFileTypes: true });
      for (const tEntry of tvEntries) {
        if (tEntry.isDirectory()) {
          const subLower = tEntry.name.toLowerCase();
          if (['western', 'chinese', 'korean', 'japanese'].includes(subLower)) {
            const subDir = path.join(tvDir, tEntry.name);
            const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
            for (const sEntry of subEntries) {
              if (sEntry.isDirectory()) {
                showsToScan.push({
                  relPath: path.posix.join(entry.name, tEntry.name, sEntry.name),
                  name: sEntry.name,
                  type: 'tv'
                });
              }
            }
          } else {
            showsToScan.push({
              relPath: path.posix.join(entry.name, tEntry.name),
              name: tEntry.name,
              type: 'tv'
            });
          }
        }
      }
    } else if (nameLower === 'anime') {
      const animeDir = path.join(videoDir, entry.name);
      const animeEntries = fs.readdirSync(animeDir, { withFileTypes: true });
      for (const aEntry of animeEntries) {
        if (aEntry.isDirectory()) {
          showsToScan.push({
            relPath: path.posix.join(entry.name, aEntry.name),
            name: aEntry.name,
            type: 'anime'
          });
        }
      }
    } else {
      // Root-level directory
      let type = 'anime';
      if (/S0?\d+|Season|第\s*\d+\s*季/i.test(entry.name)) type = 'tv';
      else if (/\((?:19|20)\d\d\)/.test(entry.name)) type = 'movie';

      showsToScan.push({
        relPath: entry.name,
        name: entry.name,
        type
      });
    }
  }

  return showsToScan;
}

const discovered = discoverShowDirectories(mockRoot);
console.log(`Discovered ${discovered.length} individual albums:`);
discovered.forEach(s => {
  console.log(`  - [${s.type.toUpperCase()}] ${s.name} (RelPath: ${s.relPath})`);
});

// Clean up
fs.rmSync(mockRoot, { recursive: true, force: true });
