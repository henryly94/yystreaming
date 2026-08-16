function isMatchingSeason(title, targetSeason) {
  const t = title.toLowerCase();

  // 1. Direct Episode / Season Match: S02, S02E01, Season 2, S2E1, Season.02
  const directRegex = new RegExp(`(?:\\bS0?${targetSeason}(?:E\\d+|\\b)|\\bSeason[.\\s_-]*0?${targetSeason}\\b)`, 'i');
  if (directRegex.test(t)) return true;

  // 2. Multi-season boxsets covering targetSeason: e.g. S01-S05, Seasons 1-5, S01-05
  const boxsetRegex = /(?:s0?1\s*-\s*s?0?([2-9])|seasons?\s*0?1\s*-\s*0?([2-9]))/i;
  const boxsetMatch = t.match(boxsetRegex);
  if (boxsetMatch) {
    const endSeason = parseInt(boxsetMatch[1] || boxsetMatch[2], 10);
    if (targetSeason <= endSeason) return true;
  }

  return false;
}

// Test titles
const testCases = [
  { title: "Breaking Bad S05 Complete (2012-2013) 1080p ENG-ITA x264 BluRay", target: 2, expected: false },
  { title: "Breaking Bad Season 2 Complete 720p.BRrip.Sujaidr", target: 2, expected: true },
  { title: "Breaking Bad (2008) Season 2 S02 + Extras (1080p BluRay x265 HEV", target: 2, expected: true },
  { title: "Breaking.Bad.S01-S02-S03-S04-S05.1080p.BluRay.10bit.HEVC-MkvCage", target: 2, expected: true },
  { title: "Breaking.Bad.S04.1080p.BluRay.x264-HD4U [Season 4 Four Complete]", target: 2, expected: false },
  { title: "Breaking Bad S02E01 Seven Thirty-Seven 2160p NF WEB-DL DDP5 1 H 265-XEBEC", target: 2, expected: true },
];

testCases.forEach(tc => {
  const result = isMatchingSeason(tc.title, tc.target);
  console.log(`[Target Season ${tc.target}] Matches: ${result} (Expected: ${tc.expected}) -> "${tc.title}"`);
});
