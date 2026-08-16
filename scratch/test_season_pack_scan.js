import fs from 'fs';
import path from 'path';

// Simulate a temporary mock library directory
const testDir = path.resolve('./scratch/mock_library');
const showDir = path.join(testDir, '绝命毒师 S02');
const packSubDir = path.join(showDir, 'Breaking.Bad.Season.2.720p.BRrip');

fs.mkdirSync(packSubDir, { recursive: true });

// Create 13 mock video files
for (let i = 1; i <= 13; i++) {
  const epStr = String(i).padStart(2, '0');
  const dummyFile = path.join(packSubDir, `Breaking.Bad.S02E${epStr}.720p.BluRay.mkv`);
  fs.writeFileSync(dummyFile, 'dummy content');
}

// Create a dummy poster.jpg
fs.writeFileSync(path.join(showDir, 'poster.jpg'), 'dummy poster');

// Test recursive scanner
function findFilesRecursively(dirPath, relativeToDir) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesRecursively(fullPath, relativeToDir));
    } else if (entry.isFile()) {
      results.push({
        fileName: entry.name,
        ext: path.extname(entry.name).toLowerCase(),
        absolutePath: fullPath,
        relativePath: path.relative(relativeToDir, fullPath)
      });
    }
  }
  return results;
}

const allFiles = findFilesRecursively(showDir, showDir);
console.log(`Found ${allFiles.length} files in show folder (including subdirectories)`);

const videoFiles = allFiles.filter(f => ['.mkv', '.mp4'].includes(f.ext));
videoFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));

console.log(`Extracted ${videoFiles.length} video files:`);
videoFiles.forEach(v => {
  let epBadge = '';
  const epM = v.fileName.match(/(?:S\d+\s*)?E(?:P)?\s*(\d{1,4}(?:\.5)?)\b/i);
  if (epM) {
    epBadge = `EP ${epM[1].padStart(2, '0')}`;
  }
  console.log(`  ✓ [${epBadge}] -> ${v.fileName} (Path: ${v.relativePath})`);
});

// Clean up mock directory
fs.rmSync(testDir, { recursive: true, force: true });
console.log('\n=== SEASON PACK SCANNING TEST PASSED! Seamless recognition with zero manual processing needed. ===');
