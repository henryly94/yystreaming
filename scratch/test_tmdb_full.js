const TMDB_KEY = '3fd2be6f0c70a2a598f084ddfb75487c';

async function searchAndInspect(title) {
  console.log(`\n=============================================`);
  console.log(`Searching TMDB for: "${title}"`);
  console.log(`=============================================`);
  
  // 1. Search Multi (Movies + TV)
  const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&language=zh-CN&query=${encodeURIComponent(title)}&include_adult=false`;
  const res = await fetch(searchUrl);
  const data = await res.json();
  
  console.log(`Total results found: ${data.results?.length || 0}`);
  const topShow = data.results?.find(r => r.media_type === 'tv') || data.results?.[0];
  if (!topShow) {
    console.log('No matching TV/Movie found.');
    return;
  }

  const mediaType = topShow.media_type || 'tv';
  const showId = topShow.id;
  const showName = topShow.name || topShow.title;
  const originalName = topShow.original_name || topShow.original_title;
  const country = topShow.origin_country || [];
  const poster = topShow.poster_path ? `https://image.tmdb.org/t/p/w500${topShow.poster_path}` : null;
  const backdrop = topShow.backdrop_path ? `https://image.tmdb.org/t/p/original${topShow.backdrop_path}` : null;

  console.log(`[Top Match]: ${showName} (${originalName}) [Type: ${mediaType}, ID: ${showId}, Country: ${country.join(', ')}]`);
  console.log(`Poster: ${poster}`);

  // 2. Fetch full details with external IDs & Seasons
  if (mediaType === 'tv') {
    const detailsUrl = `https://api.themoviedb.org/3/tv/${showId}?api_key=${TMDB_KEY}&language=zh-CN&append_to_response=external_ids`;
    const detRes = await fetch(detailsUrl);
    const details = await detRes.json();
    const imdbId = details.external_ids?.imdb_id;
    console.log(`IMDb ID: ${imdbId || 'N/A'}`);
    console.log(`Total Seasons: ${details.seasons?.length}`);
    details.seasons?.forEach(s => {
      console.log(`  - [Season ${s.season_number}] ${s.name} (${s.episode_count} episodes, Air Date: ${s.air_date})`);
    });
  }
}

async function run() {
  await searchAndInspect('怪奇物语');
  await searchAndInspect('庆余年');
  await searchAndInspect('泪之女王');
  await searchAndInspect('葬送的芙莉莲');
  await searchAndInspect('黑袍纠察队');
}

run().catch(console.error);
