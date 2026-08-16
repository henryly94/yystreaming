function scoreSeasonPack(title, sizeMb, targetSeason) {
  let score = 0;
  const isDirectSeason = new RegExp(`(?:\\bS0?${targetSeason}\\b|\\bSeason[.\\s_-]*0?${targetSeason}\\b)`, 'i').test(title);
  if (isDirectSeason) score += 100; // Prefer Season 2 specific pack!
  
  const sizeNum = parseFloat(sizeMb);
  if (sizeNum >= 1500 && sizeNum <= 15000) score += 50; // Ideal season pack size: 1.5GB - 15GB
  else if (sizeNum > 30000) score -= 50; // Penalize 30GB+ massive full series dumps

  if (/1080p/i.test(title)) score += 30;
  else if (/720p/i.test(title)) score += 20;

  return score;
}

const packs = [
  { name: "Breaking Bad S01-S05 Seasons 1-5 Complete 1080p H264 BluRay-MIXE", sizeMb: "182162.5" },
  { name: "Breaking Bad Season 2 Complete 720p.BRrip.Sujaidr", sizeMb: "4927.5" },
  { name: "Breaking Bad (2008) Season 2 S02 + Extras (1080p BluRay x265 HEV", sizeMb: "25406.7" }
];

packs.forEach(p => {
  console.log(`Score ${scoreSeasonPack(p.name, p.sizeMb, 2)}: ${p.name} (${p.sizeMb} MB)`);
});
