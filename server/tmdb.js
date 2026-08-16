// TMDB (TheMovieDB) Metadata Client

export const DEFAULT_TMDB_API_KEY = '3fd2be6f0c70a2a598f084ddfb75487c';

/**
 * Search TMDB for TV shows and Movies with Chinese localization
 */
export async function searchTmdb(query, apiKey = DEFAULT_TMDB_API_KEY) {
  if (!query || !query.trim()) return [];

  const key = (apiKey && apiKey.trim()) || DEFAULT_TMDB_API_KEY;
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${key}&language=zh-CN&query=${encodeURIComponent(query.trim())}&include_adult=false`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!res.ok) {
      console.error(`[TMDB Search]: HTTP error ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (!data.results) return [];

    return data.results
      .filter(item => item.media_type === 'tv' || item.media_type === 'movie')
      .map(item => {
        const isTv = item.media_type === 'tv';
        const name = isTv ? item.name : item.title;
        const originalName = isTv ? item.original_name : item.original_title;
        const releaseDate = isTv ? item.first_air_date : item.release_date;
        const country = item.origin_country || [];

        // Determine friendly show type label
        let showType = 'TV';
        if (country.includes('CN') || country.includes('TW') || country.includes('HK')) {
          showType = 'Chinese';
        } else if (country.includes('KR')) {
          showType = 'Korean';
        } else if (country.includes('JP')) {
          showType = 'Japanese';
        } else if (country.includes('US') || country.includes('GB') || country.includes('CA') || country.includes('AU')) {
          showType = 'Western';
        }

        return {
          id: item.id,
          mediaType: item.media_type,
          showType,
          name: name || originalName,
          originalName,
          releaseDate: releaseDate || 'N/A',
          year: releaseDate ? releaseDate.split('-')[0] : '',
          country,
          overview: item.overview || '',
          voteAverage: item.vote_average || 0,
          posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null
        };
      });
  } catch (err) {
    console.error('[TMDB Search]: Request error:', err.message);
    return [];
  }
}

/**
 * Fetch full details for a TV show including Seasons and IMDb ID
 */
export async function getTmdbShowDetails(tmdbId, apiKey = DEFAULT_TMDB_API_KEY) {
  if (!tmdbId) return null;

  const key = (apiKey && apiKey.trim()) || DEFAULT_TMDB_API_KEY;
  const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${key}&language=zh-CN&append_to_response=external_ids`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!res.ok) {
      console.error(`[TMDB Details]: HTTP error ${res.status}`);
      return null;
    }

    const data = await res.json();
    const imdbId = data.external_ids?.imdb_id || null;
    const country = data.origin_country || [];

    let showType = 'TV';
    if (country.includes('CN') || country.includes('TW') || country.includes('HK')) {
      showType = 'Chinese';
    } else if (country.includes('KR')) {
      showType = 'Korean';
    } else if (country.includes('JP')) {
      showType = 'Japanese';
    } else if (country.includes('US') || country.includes('GB') || country.includes('CA') || country.includes('AU')) {
      showType = 'Western';
    }

    const seasons = (data.seasons || [])
      .filter(s => s.season_number > 0) // Filter out Season 0 (Specials) by default
      .map(s => ({
        id: s.id,
        seasonNumber: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episodeCount: s.episode_count || 0,
        airDate: s.air_date || '',
        overview: s.overview || '',
        posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null
      }));

    return {
      id: data.id,
      mediaType: 'tv',
      showType,
      name: data.name || data.original_name,
      originalName: data.original_name,
      imdbId,
      overview: data.overview || '',
      country,
      numberOfSeasons: data.number_of_seasons || seasons.length,
      numberOfEpisodes: data.number_of_episodes || 0,
      status: data.status || 'Ended',
      posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      backdropUrl: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
      seasons
    };
  } catch (err) {
    console.error(`[TMDB Details]: Error fetching show ${tmdbId}:`, err.message);
    return null;
  }
}
