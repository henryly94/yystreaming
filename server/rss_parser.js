// Helper to convert Chinese/Roman season indicators to clean "Season X"
export function cleanShowName(rawTitle) {
  if (!rawTitle) return "Anime Show";

  // Strip initial subgroup tag like [LoliHouse] or [Nix-Raws]
  let title = rawTitle.replace(/^\[[^\]]+\]\s*/, "");

  // Extract primary name before episode delimiter or bracket
  const nameParts = title.split(/[-–—]|\[|\(|S\d+E\d+/)[0].trim();
  const subNames = nameParts.split("/").map(n => n.trim()).filter(Boolean);
  
  // Prefer English or clean Chinese name
  let mainName = subNames[0] || nameParts;
  if (subNames.length > 1) {
    const enName = subNames.find(n => /^[A-Za-z0-9\s:]+$/.test(n));
    if (enName) mainName = enName;
  }

  // Detect Season number
  let seasonStr = "";
  const seasonMatch = rawTitle.match(/(?:Season\s*|S|第)(\d+|[I|V|X]+|一|二|三|四|五|六|七|八|九|十)(?:季)?/i);
  if (seasonMatch) {
    let sVal = seasonMatch[1].toUpperCase();
    if (sVal === "II" || sVal === "Ⅱ" || sVal === "2" || sVal === "二") sVal = "2";
    else if (sVal === "III" || sVal === "Ⅲ" || sVal === "3" || sVal === "三") sVal = "3";
    else if (sVal === "IV" || sVal === "Ⅳ" || sVal === "4" || sVal === "四") sVal = "4";
    else if (sVal === "I" || sVal === "Ⅰ" || sVal === "1" || sVal === "一") sVal = "1";
    
    if (/^\d+$/.test(sVal) && parseInt(sVal, 10) > 1) {
      seasonStr = ` Season ${sVal}`;
    }
  }

  // Clean title text from Roman numerals and season words
  mainName = mainName
    .replace(/(?:II|Ⅱ|III|Ⅲ|IV|Ⅳ|S\d+|第二季|第三季|第四季|第\d+季)$/i, "")
    .trim();

  return `${mainName}${seasonStr}`.trim();
}

// Parse episode number and format properties from raw torrent title
export function parseRssItem(item) {
  const rawTitle = item.title || "";
  
  // 1. Detect Episode Number
  let episodeNum = "01";
  let isSpecial = false;

  const epMatch = rawTitle.match(/(?:-\s*|S\d+E|E|\[)(\d{1,3}(?:\.5)?)(?:\]|\s+v\d+|\s*\[|\s+|$)/i) 
               || rawTitle.match(/(?:第)(\d{1,3})(?:话|話|集)/);

  if (epMatch) {
    episodeNum = epMatch[1].padStart(2, "0");
  } else if (/SP\d+/i.test(rawTitle)) {
    const spM = rawTitle.match(/SP(\d+)/i);
    episodeNum = spM ? `SP${spM[1].padStart(2, "0")}` : "SP";
    isSpecial = true;
  } else if (/OVA\d+/i.test(rawTitle)) {
    const ovaM = rawTitle.match(/OVA(\d+)/i);
    episodeNum = ovaM ? `OVA${ovaM[1].padStart(2, "0")}` : "OVA";
    isSpecial = true;
  }

  // 2. Check if file is H.264 / AVC 8-bit (qualifies for 2-second Fast Remux)
  const isH264 = /AVC|H264|H\.264|x264|Baha|CR|CATCHPLAY|MP4/i.test(rawTitle) 
              && !/HEVC|H265|H\.265|10bit|10-bit/i.test(rawTitle);

  // 3. Resolution check
  const is1080p = /1080|1920x1080/i.test(rawTitle);

  // 4. Extract torrent / magnet link
  let downloadUrl = "";
  if (item.enclosure && item.enclosure.url) {
    downloadUrl = item.enclosure.url;
  } else if (item.link) {
    downloadUrl = item.link;
  }

  return {
    rawTitle,
    episodeNum,
    isSpecial,
    isH264,
    is1080p,
    pubDate: item.pubDate ? new Date(item.pubDate).getTime() : 0,
    downloadUrl,
    cleanEpisodeName: isSpecial ? episodeNum : `Episode ${episodeNum}`
  };
}

// Group items by episode number and prioritize H.264 / AVC fast-remux releases
export function deduplicateAndFilterRssItems(rawItems) {
  const parsedList = rawItems.map(item => parseRssItem(item));
  const groups = new Map();

  for (const item of parsedList) {
    if (!item.downloadUrl) continue;
    const key = item.episodeNum;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }

  const selectedList = [];

  for (const [epNum, items] of groups.entries()) {
    // Sort releases for this episode:
    // 1. H.264/AVC 8-bit fast-remux releases first
    // 2. 1080p resolution second
    // 3. Newest publication date third
    items.sort((a, b) => {
      if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
      if (a.is1080p !== b.is1080p) return a.is1080p ? -1 : 1;
      return b.pubDate - a.pubDate;
    });

    // Top choice is recommended
    const bestChoice = items[0];
    selectedList.push({
      ...bestChoice,
      allReleasesCount: items.length
    });
  }

  // Sort by episode number ascending
  selectedList.sort((a, b) => a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true }));
  return selectedList;
}
