async function inspectAllOptions(title, seasonNumber) {
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  const data = await res.json();

  const seasonRegex = new RegExp(`S0?${seasonNumber}|Season\\s*0?${seasonNumber}|Complete`, 'i');
  const matched = data.filter(t => seasonRegex.test(t.name));

  console.log(`Found ${matched.length} torrents for "${title}" Season ${seasonNumber}:`);
  matched.forEach(t => {
    const sizeMb = (parseInt(t.size, 10) / (1024 * 1024)).toFixed(1);
    const is4k = /2160p|4k/i.test(t.name);
    const is1080p = /1080p/i.test(t.name);
    const is720p = /720p/i.test(t.name);
    const is480p = /480p|xvid|dvdrip/i.test(t.name);
    const res = is4k ? '4K (2160p)' : is1080p ? '1080p' : is720p ? '720p' : is480p ? '480p' : 'Other';
    console.log(`  - [${res}] (${sizeMb} MB, Seeds: ${t.seeders}): ${t.name}`);
  });
}

inspectAllOptions('Breaking Bad', 2);
