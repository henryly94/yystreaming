// Helper to clean anime show title from Mikan RSS title
export function cleanShowName(rawTitle) {
  if (!rawTitle) return "Anime Show";
  
  // Remove common fansub tags in brackets at start e.g. 【极影字幕·毁片党】, [Sakurato], [KTXP]
  let cleaned = rawTitle.replace(/^(?:【[^】]+】|\[[^\]]+\]|\([^)]+\))\s*/g, '');
  
  // Remove resolution and codec tags at end e.g. GB_CN AV1_opus 1080p, [1080p], [HEVC-10bit]
  cleaned = cleaned.replace(/\s*(?:\[|\(|【)?(?:1080p|720p|2160p|4k|HEVC|AVC|H264|H265|AV1|AAC|MP4|MKV|ASS|CHS|CHT|GB_CN|BIG5|WebRip|Bilibili).*/i, '');
  
  // Remove episode numbers at end e.g. 第06集, - 06, S3E06
  cleaned = cleaned.replace(/\s*(?:S\d+)?(?:E|EP|第)?\s*\d{1,4}(?:\.5)?\s*(?:[集話话])?$/i, '');
  cleaned = cleaned.replace(/\s*-\s*\d{1,3}.*$/i, '');
  
  return cleaned.trim() || rawTitle;
}

// Extract exact episode number from Mikan RSS item title
export function parseRssItem(item) {
  const rawTitle = item.title || "";

  // Check special episode flags
  const isSpecial = /SP|OVA|OAD|Movie|剧场版|劇場版/i.test(rawTitle);
  const spM = rawTitle.match(/SP\s*(\d{1,2})/i);
  const ovaM = rawTitle.match(/OVA\s*(\d{1,2})/i);

  let episodeNum = null;

  // 1. Check explicit Chinese episode pattern (highest priority): 第06集 / 第6話 / 第06话
  const cnMatch = rawTitle.match(/第\s*(\d{1,4}(?:\.5)?)\s*(?:v\d+)?\s*[集話话]/i);
  if (cnMatch) {
    episodeNum = cnMatch[1].padStart(2, "0");
  }

  // 2. Check explicit S03E06 / E06 / EP06 pattern
  if (!episodeNum) {
    const epMatch = rawTitle.match(/(?:S\d+\s*)?E(?:P)?\s*(\d{1,4}(?:\.5)?)\b/i);
    if (epMatch) {
      episodeNum = epMatch[1].padStart(2, "0");
    }
  }

  // 3. Check bracketed episode pattern: [06] or 【06】 (excluding resolution/codec tags like 1080P, 720P, 2160P, 10bit)
  if (!episodeNum) {
    const bracketMatches = [...rawTitle.matchAll(/(?:\[|【)\s*(\d{1,3}(?:\.5)?)(?:v\d+)?\s*(?:\]|】)/g)];
    for (const match of bracketMatches) {
      const fullMatchStr = match[0].toUpperCase();
      const num = parseInt(match[1], 10);
      
      // Skip if bracket contains P (1080P), K (4K), BIT (10BIT), or resolution numbers 1080, 720, 2160
      if (fullMatchStr.includes("P") || fullMatchStr.includes("K") || fullMatchStr.includes("BIT")) {
        continue;
      }
      if (num === 1080 || num === 720 || num === 2160 || num === 264 || num === 265) {
        continue;
      }

      episodeNum = match[1].padStart(2, "0");
      break;
    }
  }

  // 4. Check hyphenated pattern: - 06 or - 6
  if (!episodeNum) {
    const hyphenMatch = rawTitle.match(/(?:-\s*|\s+)(\d{1,3}(?:\.5)?)(?:\s*v\d+)?(?:\s+\[|\s+|$)/i);
    if (hyphenMatch) {
      const num = parseInt(hyphenMatch[1], 10);
      if (num !== 1080 && num !== 720 && num !== 2160 && num !== 264 && num !== 265) {
        episodeNum = hyphenMatch[1].padStart(2, "0");
      }
    }
  }

  // 5. Fallback for Specials / OVA or unknown
  if (!episodeNum) {
    if (spM) episodeNum = `SP${spM[1].padStart(2, "0")}`;
    else if (ovaM) episodeNum = `OVA${ovaM[1].padStart(2, "0")}`;
    else if (isSpecial) episodeNum = "SP";
    else {
      // Fallback: use hash of title so items are not merged together
      const simpleHash = Math.abs(rawTitle.split("").reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)).toString(36).slice(0, 4);
      episodeNum = `EP_${simpleHash}`;
    }
  }

  // Quality & Format indicators
  const is1080p = /1080p|1920x1080/i.test(rawTitle);
  const is720p = /720p|1280x720/i.test(rawTitle);
  const isH264 = /H\.?264|AVC/i.test(rawTitle);
  const isHEVC = /H\.?265|HEVC|AV1/i.test(rawTitle);
  const isSoftSub = /简繁内封|内封|SRT|ASS|VTT/i.test(rawTitle);
  const isChs = /简|CHS|GB/i.test(rawTitle);

  // Extract download URL
  let downloadUrl = "";
  if (item.enclosure && item.enclosure.url) {
    downloadUrl = item.enclosure.url;
  } else if (item.link) {
    downloadUrl = item.link;
  }

  return {
    rawTitle,
    episodeNum,
    downloadUrl,
    pubDate: item.pubDate ? new Date(item.pubDate).getTime() : 0,
    is1080p,
    is720p,
    isH264,
    isHEVC,
    isSoftSub,
    isChs,
    cleanEpisodeName: isSpecial ? episodeNum : `Episode ${episodeNum}`
  };
}

// Deduplicate items so each episode number is included only ONCE
export function deduplicateAndFilterRssItems(rawItems) {
  const parsedList = rawItems.map(item => parseRssItem(item));
  
  // Group by episodeNum
  const grouped = new Map();
  for (const item of parsedList) {
    const key = item.episodeNum;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  }

  const selectedList = [];
  for (const [epNum, items] of grouped.entries()) {
    // Pick the best quality & subtitle version for each episode number
    items.sort((a, b) => {
      // Prioritize 1080p
      if (a.is1080p !== b.is1080p) return a.is1080p ? -1 : 1;
      // Prioritize soft subs (简繁内封) > hard subs
      if (a.isSoftSub !== b.isSoftSub) return a.isSoftSub ? -1 : 1;
      // Prioritize H.264 / AVC (fast 2s remux)
      if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
      // Prioritize Simplified Chinese (简)
      if (a.isChs !== b.isChs) return a.isChs ? -1 : 1;
      return b.pubDate - a.pubDate;
    });
    selectedList.push(items[0]);
  }

  // Sort episodes in ascending numerical order
  selectedList.sort((a, b) => a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true }));

  return selectedList;
}
