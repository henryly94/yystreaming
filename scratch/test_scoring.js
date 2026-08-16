function scoreMockItem(item) {
  let score = 0;
  const { isH264, is8Bit, isAac, hasSub, sizeMb } = item;

  if (!hasSub && isH264 && is8Bit && isAac) {
    score = 10000000 - sizeMb;
    item.label = '⚡ Fast Remux (2s)';
  } else if (!hasSub && isH264 && is8Bit) {
    score = 5000000 - sizeMb;
    item.label = '⚡ Video Copy + AAC (15s)';
  } else {
    score = 1000000 - sizeMb;
    item.label = hasSub ? '🔥 Full Transcode (Burn Subtitles)' : '🔥 Full Transcode (HEVC)';
  }
  item.score = score;
  return score;
}

const mockFiles = [
  { name: 'Breaking_Bad_S02E01_HEVC_10bit_BurnSub.mkv', isH264: false, is8Bit: false, isAac: true, hasSub: true, sizeMb: 1200 },
  { name: 'Movie_007_H264_AAC_Clean_FastRemux.mp4', isH264: true, is8Bit: true, isAac: true, hasSub: false, sizeMb: 2100 },
  { name: 'Anime_Frieren_EP01_H264_FLAC.mkv', isH264: true, is8Bit: true, isAac: false, hasSub: false, sizeMb: 800 },
  { name: 'Short_Clip_HEVC.mkv', isH264: false, is8Bit: false, isAac: true, hasSub: false, sizeMb: 200 }
];

mockFiles.forEach(scoreMockItem);
mockFiles.sort((a, b) => b.score - a.score);

console.log('Optimized Queue Order:');
mockFiles.forEach((f, idx) => {
  console.log(`  ${idx + 1}. [Score: ${f.score}] ${f.label} -> ${f.name}`);
});
