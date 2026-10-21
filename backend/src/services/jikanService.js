const axios = require('axios');
const { JIKAN_BASE_URL } = require('../config/constants');

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

function formatAnimeItem(item) {
  if (!item) return null;
  const mal_id = item.mal_id || item.id;
  const poster =
    item.images?.webp?.large_image_url ||
    item.images?.jpg?.large_image_url ||
    item.images?.webp?.image_url ||
    item.images?.jpg?.image_url ||
    '';

  const genres = Array.isArray(item.genres) && item.genres.length > 0
    ? item.genres.map((g) => (typeof g === 'string' ? g : g.name))
    : ['Anime'];

  return {
    id: String(mal_id),
    mal_id,
    title: item.title || item.title_english || 'Anime',
    originalTitle: item.title_japanese || item.title || '',
    poster,
    image: poster,
    episodes: item.episodes || 12,
    score: item.score || 8.4,
    year: item.year || item.aired?.prop?.from?.year || 2024,
    type: item.type === 'Movie' ? 'Película' : 'Serie',
    genres,
    synopsis: item.synopsis || 'Sinopsis no disponible.',
  };
}

/**
 * Fallback a Kitsu API en caso de que Jikan sufra rate-limit o timeout.
 */
async function fallbackKitsuSearch(query, limit = 6) {
  try {
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}`;
    const res = await axios.get(url, {
      headers: {
        Accept: 'application/vnd.api+json',
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
      },
      timeout: 3500,
    });
    const data = res.data?.data || [];
    return data.map((item) => {
      const attr = item.attributes || {};
      const year = attr.startDate ? new Date(attr.startDate).getFullYear() : 2024;
      const score = attr.averageRating ? parseFloat((Number(attr.averageRating) / 10).toFixed(1)) : 8.5;
      const poster = attr.posterImage?.large || attr.posterImage?.original || attr.posterImage?.medium || '';

      return {
        id: String(item.id),
        mal_id: item.id,
        title: attr.canonicalTitle || attr.titles?.en || attr.titles?.ja_jp || 'Anime',
        originalTitle: attr.titles?.ja_jp || attr.canonicalTitle || '',
        poster,
        image: poster,
        episodes: attr.episodeCount || 12,
        score,
        year,
        type: attr.subtype === 'movie' ? 'Película' : 'Serie',
        genres: ['Anime'],
        synopsis: attr.synopsis || 'Sinopsis no disponible.',
      };
    });
  } catch (err) {
    console.error('Fallback Kitsu error:', err.message);
    return [];
  }
}

async function searchAnimeMetadata(query, limit = 12) {
  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/anime`, {
      params: { q: query, limit, sfw: true },
      headers: DEFAULT_HEADERS,
      timeout: 3500,
    });
    const results = response.data?.data || [];
    if (results.length > 0) return results.map(formatAnimeItem);
  } catch (error) {
    console.warn('Jikan API demoró o falló, usando fallback Kitsu:', error.message);
  }
  return await fallbackKitsuSearch(query, limit);
}

async function getTopAnimeMetadata(limit = 10) {
  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/top/anime`, {
      params: { limit, filter: 'bypopularity' },
      headers: DEFAULT_HEADERS,
      timeout: 3500,
    });
    const results = response.data?.data || [];
    if (results.length > 0) return results.map(formatAnimeItem);
  } catch (error) {
    console.warn('Jikan top anime falló, usando fallback Kitsu:', error.message);
  }

  // Fallback Kitsu trending
  try {
    const res = await axios.get(`https://kitsu.io/api/edge/trending/anime?limit=${limit}`, {
      headers: DEFAULT_HEADERS,
      timeout: 3500,
    });
    const data = res.data?.data || [];
    return data.map((item) => {
      const attr = item.attributes || {};
      const poster = attr.posterImage?.large || attr.posterImage?.original || '';
      return {
        id: String(item.id),
        mal_id: item.id,
        title: attr.canonicalTitle || attr.titles?.en || 'Anime',
        originalTitle: attr.titles?.ja_jp || '',
        poster,
        image: poster,
        episodes: attr.episodeCount || 12,
        score: attr.averageRating ? parseFloat((Number(attr.averageRating) / 10).toFixed(1)) : 8.8,
        year: attr.startDate ? new Date(attr.startDate).getFullYear() : 2024,
        type: attr.subtype === 'movie' ? 'Película' : 'Serie',
        genres: ['Anime'],
        synopsis: attr.synopsis || 'Sinopsis no disponible.',
      };
    });
  } catch (_) {
    return [];
  }
}

async function getAnimeByIdMetadata(id) {
  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/anime/${id}`, {
      headers: DEFAULT_HEADERS,
      timeout: 3500,
    });
    const item = response.data?.data;
    if (item) return formatAnimeItem(item);
  } catch (error) {
    console.warn(`Jikan getAnimeById falló para id ${id}:`, error.message);
  }

  // Fallback a Kitsu por ID
  try {
    const res = await axios.get(`https://kitsu.io/api/edge/anime/${id}`, {
      headers: {
        Accept: 'application/vnd.api+json',
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
      },
      timeout: 3500,
    });
    const item = res.data?.data;
    if (item) {
      const attr = item.attributes || {};
      const year = attr.startDate ? new Date(attr.startDate).getFullYear() : 2024;
      const score = attr.averageRating ? parseFloat((Number(attr.averageRating) / 10).toFixed(1)) : 8.5;
      const poster = attr.posterImage?.large || attr.posterImage?.original || '';
      return {
        id: String(item.id),
        mal_id: item.id,
        title: attr.canonicalTitle || attr.titles?.en || 'Anime',
        originalTitle: attr.titles?.ja_jp || '',
        poster,
        image: poster,
        episodes: attr.episodeCount || 12,
        score,
        year,
        type: attr.subtype === 'movie' ? 'Película' : 'Serie',
        genres: ['Anime'],
        synopsis: attr.synopsis || 'Sinopsis no disponible.',
      };
    }
  } catch (_) {}

  return null;
}

async function getRecommendationsMetadata(id) {
  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/anime/${id}/recommendations`, {
      headers: DEFAULT_HEADERS,
      timeout: 3500,
    });
    const raw = response.data?.data || [];
    return raw.slice(0, 8).map((r) => {
      const entry = r.entry || {};
      const poster = entry.images?.webp?.large_image_url || entry.images?.jpg?.large_image_url || '';
      return {
        id: String(entry.mal_id),
        mal_id: entry.mal_id,
        title: entry.title,
        poster,
        image: poster,
        score: 8.5,
        type: 'Serie',
        genres: ['Anime'],
      };
    });
  } catch (error) {
    console.warn(`Jikan getRecommendations falló para id ${id}:`, error.message);
    return [];
  }
}

module.exports = {
  searchAnimeMetadata,
  getTopAnimeMetadata,
  getAnimeByIdMetadata,
  getRecommendationsMetadata,
};
