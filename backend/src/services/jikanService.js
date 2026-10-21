const axios = require('axios');
const { JIKAN_BASE_URL } = require('../config/constants');

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const KITSU_HEADERS = {
  Accept: 'application/vnd.api+json',
  'User-Agent': DEFAULT_HEADERS['User-Agent'],
};

// ==========================================
// 1. Caché en memoria con TTL (Item 7)
// ==========================================
class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  clear() {
    this.store.clear();
  }
}

const memoryCache = new MemoryCache();

// ==========================================
// 2. Diccionario de traducción de géneros (Item 1)
// ==========================================
const GENRE_TRANSLATIONS = {
  Action: 'Acción',
  Adventure: 'Aventura',
  AvantGarde: 'Vanguardia',
  'Avant Garde': 'Vanguardia',
  AwardWinning: 'Premiado',
  'Award Winning': 'Premiado',
  Comedy: 'Comedia',
  Drama: 'Drama',
  Fantasy: 'Fantasía',
  Gourmet: 'Gastronomía',
  Horror: 'Terror',
  Mystery: 'Misterio',
  Romance: 'Romance',
  'Sci-Fi': 'Ciencia Ficción',
  SciFi: 'Ciencia Ficción',
  'Slice of Life': 'Recuentos de la vida',
  Sports: 'Deportes',
  Supernatural: 'Sobrenatural',
  Suspense: 'Suspenso',
  Thriller: 'Suspenso',
  Ecchi: 'Ecchi',
  Erotica: 'Erótico',
  Hentai: 'Hentai',
  Psychological: 'Psicológico',
  Mecha: 'Mecha',
  Music: 'Música',
  Isekai: 'Isekai',
  Historical: 'Histórico',
  Military: 'Militar',
  Parody: 'Parodia',
  Samurai: 'Samurái',
  School: 'Escolar',
  Space: 'Espacio',
  SuperPower: 'Superpoderes',
  'Super Power': 'Superpoderes',
  Vampire: 'Vampiros',
  Harem: 'Harén',
  Demons: 'Demonios',
  Magic: 'Magia',
  MartialArts: 'Artes Marciales',
  'Martial Arts': 'Artes Marciales',
  Game: 'Juegos',
  Cars: 'Carreras',
  Kids: 'Infantil',
  Police: 'Policial',
  Shounen: 'Shonen',
  Shoujo: 'Shojo',
  Seinen: 'Seinen',
  Josei: 'Josei',
};

function translateGenre(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  return GENRE_TRANSLATIONS[trimmed] || trimmed;
}

function extractGenres(rawGenres) {
  if (!Array.isArray(rawGenres)) return [];
  const list = rawGenres
    .map((g) => {
      const name = typeof g === 'string' ? g : g?.name;
      return translateGenre(name);
    })
    .filter(Boolean);
  return Array.from(new Set(list));
}

function slugifyTitle(title = '') {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ==========================================
// 3. Formateo de Anime con null seguro (Items 3 y 4)
// ==========================================
function formatAnimeItem(item) {
  if (!item) return null;
  const mal_id = item.mal_id || item.id || null;
  const poster =
    item.images?.webp?.large_image_url ||
    item.images?.jpg?.large_image_url ||
    item.images?.webp?.image_url ||
    item.images?.jpg?.image_url ||
    '';

  const genres = extractGenres(item.genres);

  const score =
    item.score != null && !isNaN(Number(item.score)) ? Number(item.score) : null;
  const episodes =
    item.episodes != null && Number(item.episodes) > 0 ? Number(item.episodes) : null;
  const year = item.year || item.aired?.prop?.from?.year || null;
  const title = item.title || item.title_english || 'Anime';
  const slug = slugifyTitle(title);

  return {
    id: mal_id ? String(mal_id) : `anime-${Date.now()}`,
    mal_id,
    title,
    slug,
    audioKey: 'SUB',
    originalTitle: item.title_japanese || item.title || '',
    poster,
    image: poster,
    episodes,
    score,
    year,
    type: item.type === 'Movie' ? 'Película' : 'Serie',
    genres,
    synopsis: item.synopsis || 'Sinopsis no disponible.',
  };
}

// ==========================================
// 4. Fallback Kitsu con relaciones y géneros (Items 1, 4 y 5)
// ==========================================
async function fallbackKitsuSearch(query, limit = 12) {
  try {
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}&include=mappings,categories`;
    const res = await axios.get(url, {
      headers: KITSU_HEADERS,
      timeout: 4000,
    });
    const data = res.data?.data || [];
    const included = res.data?.included || [];

    return data.map((item) => {
      const attr = item.attributes || {};
      const year = attr.startDate ? new Date(attr.startDate).getFullYear() : null;
      const score = attr.averageRating
        ? parseFloat((Number(attr.averageRating) / 10).toFixed(1))
        : null;
      const episodes = attr.episodeCount || null;
      const poster =
        attr.posterImage?.large ||
        attr.posterImage?.original ||
        attr.posterImage?.medium ||
        '';

      // Buscar si tiene mapping de MyAnimeList en las relaciones (Item 5)
      const mappingRef = item.relationships?.mappings?.data || [];
      const malMapping = included.find(
        (inc) =>
          inc.type === 'mappings' &&
          inc.attributes?.externalSite === 'myanimelist/anime' &&
          mappingRef.some((ref) => ref.id === inc.id),
      );
      const realMalId = malMapping?.attributes?.externalId
        ? Number(malMapping.attributes.externalId)
        : null;

      // Extraer y traducir categorías de Kitsu al español (Item 1)
      const categoryRefs = item.relationships?.categories?.data || [];
      const categoryNames = included
        .filter((inc) => inc.type === 'categories' && categoryRefs.some((ref) => ref.id === inc.id))
        .map((inc) => inc.attributes?.title);
      const genres = extractGenres(categoryNames);

      const itemTitle = attr.canonicalTitle || attr.titles?.en || attr.titles?.ja_jp || 'Anime';
      const itemSlug = slugifyTitle(itemTitle);

      return {
        id: realMalId ? String(realMalId) : `kitsu-${item.id}`,
        mal_id: realMalId,
        title: itemTitle,
        slug: itemSlug,
        audioKey: 'SUB',
        originalTitle: attr.titles?.ja_jp || attr.canonicalTitle || '',
        poster,
        image: poster,
        episodes,
        score,
        year,
        type: attr.subtype === 'movie' ? 'Película' : 'Serie',
        genres,
        synopsis: attr.synopsis || 'Sinopsis no disponible.',
      };
    });
  } catch (err) {
    console.error('Fallback Kitsu search error:', err.message);
    return [];
  }
}

async function fallbackKitsuTop(limit = 10, type = null) {
  try {
    let url = `https://kitsu.io/api/edge/anime?sort=-userCount&page[limit]=${limit}&include=mappings,categories`;
    if (type === 'movie') {
      url = `https://kitsu.io/api/edge/anime?filter[subtype]=movie&sort=-userCount&page[limit]=${limit}&include=mappings,categories`;
    } else if (type === 'tv') {
      url = `https://kitsu.io/api/edge/anime?filter[subtype]=tv&sort=-userCount&page[limit]=${limit}&include=mappings,categories`;
    }

    const res = await axios.get(url, {
      headers: KITSU_HEADERS,
      timeout: 4000,
    });
    const data = res.data?.data || [];
    const included = res.data?.included || [];

    return data.map((item) => {
      const attr = item.attributes || {};
      const year = attr.startDate ? new Date(attr.startDate).getFullYear() : null;
      const score = attr.averageRating
        ? parseFloat((Number(attr.averageRating) / 10).toFixed(1))
        : null;
      const episodes = attr.episodeCount || null;
      const poster =
        attr.posterImage?.large || attr.posterImage?.original || '';

      const mappingRef = item.relationships?.mappings?.data || [];
      const malMapping = included.find(
        (inc) =>
          inc.type === 'mappings' &&
          inc.attributes?.externalSite === 'myanimelist/anime' &&
          mappingRef.some((ref) => ref.id === inc.id),
      );
      const realMalId = malMapping?.attributes?.externalId
        ? Number(malMapping.attributes.externalId)
        : null;

      const categoryRefs = item.relationships?.categories?.data || [];
      const categoryNames = included
        .filter((inc) => inc.type === 'categories' && categoryRefs.some((ref) => ref.id === inc.id))
        .map((inc) => inc.attributes?.title);
      const genres = extractGenres(categoryNames);

      const topTitle = attr.canonicalTitle || attr.titles?.en || 'Anime';
      const topSlug = slugifyTitle(topTitle);

      return {
        id: realMalId ? String(realMalId) : `kitsu-${item.id}`,
        mal_id: realMalId,
        title: topTitle,
        slug: topSlug,
        audioKey: 'SUB',
        originalTitle: attr.titles?.ja_jp || '',
        poster,
        image: poster,
        episodes,
        score,
        year,
        type: attr.subtype === 'movie' ? 'Película' : 'Serie',
        genres,
        synopsis: attr.synopsis || 'Sinopsis no disponible.',
      };
    });
  } catch (err) {
    console.error('Fallback Kitsu top error:', err.message);
    return [];
  }
}

async function getKitsuAnimeById(kitsuId, overrideMalId = null) {
  try {
    const res = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}?include=categories,mappings`, {
      headers: KITSU_HEADERS,
      timeout: 4000,
    });
    const item = res.data?.data;
    if (!item) return null;

    const included = res.data?.included || [];
    const attr = item.attributes || {};
    const year = attr.startDate ? new Date(attr.startDate).getFullYear() : null;
    const score = attr.averageRating
      ? parseFloat((Number(attr.averageRating) / 10).toFixed(1))
      : null;
    const episodes = attr.episodeCount || null;
    const poster =
      attr.posterImage?.large || attr.posterImage?.original || '';

    let realMalId = overrideMalId;
    if (!realMalId) {
      const mappingRef = item.relationships?.mappings?.data || [];
      const malMapping = included.find(
        (inc) =>
          inc.type === 'mappings' &&
          inc.attributes?.externalSite === 'myanimelist/anime' &&
          mappingRef.some((ref) => ref.id === inc.id),
      );
      realMalId = malMapping?.attributes?.externalId
        ? Number(malMapping.attributes.externalId)
        : null;
    }

    const categoryRefs = item.relationships?.categories?.data || [];
    const categoryNames = included
      .filter((inc) => inc.type === 'categories' && categoryRefs.some((ref) => ref.id === inc.id))
      .map((inc) => inc.attributes?.title);
    const genres = extractGenres(categoryNames);

    const byIdTitle = attr.canonicalTitle || attr.titles?.en || 'Anime';
    const byIdSlug = slugifyTitle(byIdTitle);

    return {
      id: realMalId ? String(realMalId) : `kitsu-${item.id}`,
      mal_id: realMalId,
      title: byIdTitle,
      slug: byIdSlug,
      audioKey: 'SUB',
      originalTitle: attr.titles?.ja_jp || '',
      poster,
      image: poster,
      episodes,
      score,
      year,
      type: attr.subtype === 'movie' ? 'Película' : 'Serie',
      genres,
      synopsis: attr.synopsis || 'Sinopsis no disponible.',
    };
  } catch (err) {
    console.error(`Error al consultar Kitsu ID ${kitsuId}:`, err.message);
    return null;
  }
}

async function getKitsuAnimeByMalId(malId) {
  try {
    const res = await axios.get(
      `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${malId}&include=item`,
      {
        headers: KITSU_HEADERS,
        timeout: 4000,
      },
    );
    const kitsuItem = res.data?.included?.[0];
    if (kitsuItem?.id) {
      return await getKitsuAnimeById(kitsuItem.id, Number(malId));
    }
  } catch (err) {
    console.warn(`Fallback mapping Kitsu para MAL ID ${malId} falló:`, err.message);
  }
  return null;
}

// ==========================================
// 5. Métodos Exportados con Soporte de Caché (Items 2 y 7)
// ==========================================

async function searchAnimeMetadata(query, limit = 12) {
  const cacheKey = `search:${query.toLowerCase().trim()}:${limit}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/anime`, {
      params: { q: query, limit, sfw: true },
      headers: DEFAULT_HEADERS,
      timeout: 3000,
    });
    const results = response.data?.data || [];
    if (results.length > 0) {
      const formatted = results.map(formatAnimeItem).filter(Boolean);
      memoryCache.set(cacheKey, formatted, 5 * 60); // 5 minutos de caché
      return formatted;
    }
  } catch (error) {
    console.warn('Jikan search demoró o falló, usando fallback Kitsu:', error.message);
  }

  const fallbackResults = await fallbackKitsuSearch(query, limit);
  if (fallbackResults.length > 0) {
    memoryCache.set(cacheKey, fallbackResults, 5 * 60);
  }
  return fallbackResults;
}

async function getTopAnimeMetadata(limit = 10, type = null) {
  const validTypes = ['tv', 'movie', 'ova', 'special', 'ona', 'music'];
  const normalizedType =
    type && validTypes.includes(type.toLowerCase()) ? type.toLowerCase() : null;

  const cacheKey = `top:${limit}:${normalizedType || 'all'}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const params = { limit, filter: 'bypopularity' };
  if (normalizedType) params.type = normalizedType;

  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/top/anime`, {
      params,
      headers: DEFAULT_HEADERS,
      timeout: 3000,
    });
    const results = response.data?.data || [];
    if (results.length > 0) {
      const formatted = results.map(formatAnimeItem).filter(Boolean);
      memoryCache.set(cacheKey, formatted, 10 * 60); // 10 minutos para top anime (Item 7)
      return formatted;
    }
  } catch (error) {
    console.warn('Jikan top anime falló o demoró, usando fallback Kitsu:', error.message);
  }

  const fallbackResults = await fallbackKitsuTop(limit, normalizedType);
  if (fallbackResults.length > 0) {
    memoryCache.set(cacheKey, fallbackResults, 10 * 60);
  }
  return fallbackResults;
}

async function getAnimeByIdMetadata(id) {
  const strId = String(id).trim();
  const cacheKey = `anime:${strId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  // Si proviene de Kitsu fallback directo
  if (strId.startsWith('kitsu-')) {
    const kitsuId = strId.replace('kitsu-', '');
    const kitsuItem = await getKitsuAnimeById(kitsuId);
    if (kitsuItem) {
      memoryCache.set(cacheKey, kitsuItem, 60 * 60); // 1 hora para detalle (Item 7)
      return kitsuItem;
    }
    return null;
  }

  // Consulta por ID en Jikan
  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/anime/${strId}`, {
      headers: DEFAULT_HEADERS,
      timeout: 3000,
    });
    const item = response.data?.data;
    if (item) {
      const formatted = formatAnimeItem(item);
      memoryCache.set(cacheKey, formatted, 60 * 60); // 1 hora para detalle (Item 7)
      return formatted;
    }
  } catch (error) {
    console.warn(`Jikan getAnimeById falló para id ${strId}, intentando fallback Kitsu:`, error.message);
  }

  // Si Jikan falló pero tenemos un ID de MAL, buscamos el anime en Kitsu vía mapping
  const kitsuByMal = await getKitsuAnimeByMalId(strId);
  if (kitsuByMal) {
    memoryCache.set(cacheKey, kitsuByMal, 60 * 60); // 1 hora de caché
    return kitsuByMal;
  }

  return null;
}

async function getRecommendationsMetadata(id) {
  const strId = String(id).trim();
  if (strId.startsWith('kitsu-')) return [];

  const cacheKey = `recs:${strId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${JIKAN_BASE_URL}/anime/${strId}/recommendations`, {
      headers: DEFAULT_HEADERS,
      timeout: 3000,
    });
    const raw = response.data?.data || [];
    const formatted = raw.slice(0, 8).map((r) => {
      const entry = r.entry || {};
      const poster =
        entry.images?.webp?.large_image_url ||
        entry.images?.jpg?.large_image_url ||
        '';
      return {
        id: String(entry.mal_id),
        mal_id: entry.mal_id,
        title: entry.title,
        poster,
        image: poster,
        score: null,
        episodes: null,
        year: null,
        type: 'Serie',
        genres: [],
      };
    });
    memoryCache.set(cacheKey, formatted, 60 * 60); // 1 hora de caché
    return formatted;
  } catch (error) {
    console.warn(`Jikan getRecommendations falló para id ${strId}:`, error.message);
    return [];
  }
}

/**
 * Obtiene miniaturas y títulos reales de cada episodio vía Kitsu CDN (sin descargar nada)
 */
async function getAnimeEpisodesThumbnails({ id, title, limit = 50, offset = 0 }) {
  const cacheKey = `ep-thumbs:${id || title}:${limit}:${offset}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  let kitsuId = null;
  const strId = String(id || '');

  // 1. Si el ID ya es de Kitsu
  if (strId.startsWith('kitsu-')) {
    kitsuId = strId.replace('kitsu-', '');
  }

  // 2. Si es un ID numérico de MyAnimeList, obtener el mapping hacia Kitsu
  if (!kitsuId && /^\d+$/.test(strId)) {
    try {
      const mapRes = await axios.get(
        `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${strId}&include=item`,
        { headers: KITSU_HEADERS, timeout: 4000 }
      );
      kitsuId = mapRes.data?.data?.[0]?.relationships?.item?.data?.id;
    } catch (e) {
      // Ignorar fallback silencioso
    }
  }

  // 3. Fallback por búsqueda de título
  if (!kitsuId && title) {
    try {
      const searchRes = await axios.get(
        `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1`,
        { headers: KITSU_HEADERS, timeout: 4000 }
      );
      kitsuId = searchRes.data?.data?.[0]?.id;
    } catch (e) {
      // Ignorar fallback silencioso
    }
  }

  if (!kitsuId) {
    return [];
  }

  // 4. Obtener episodios de Kitsu con sus capturas CDN (límite máximo de página de Kitsu es 20)
  try {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const pagesCount = Math.min(5, Math.ceil(safeLimit / 20));
    const pagePromises = [];

    for (let i = 0; i < pagesCount; i++) {
      const pageOffset = offset + i * 20;
      const pageSize = Math.min(20, safeLimit - i * 20);
      if (pageSize <= 0) break;
      pagePromises.push(
        axios
          .get(
            `https://kitsu.io/api/edge/episodes?filter[mediaId]=${kitsuId}&page[limit]=${pageSize}&page[offset]=${pageOffset}&sort=number`,
            { headers: KITSU_HEADERS, timeout: 5000 }
          )
          .catch(() => ({ data: { data: [] } }))
      );
    }

    const responses = await Promise.all(pagePromises);
    const formatted = [];

    for (const r of responses) {
      const list = r.data?.data || [];
      for (const ep of list) {
        const attr = ep.attributes || {};
        const thumb =
          attr.thumbnail?.small ||
          attr.thumbnail?.medium ||
          attr.thumbnail?.original ||
          attr.thumbnail?.tiny ||
          null;
        formatted.push({
          number: attr.number,
          title: attr.canonicalTitle || (attr.titles?.en || attr.titles?.en_jp || `Episodio ${attr.number}`),
          thumbnail: thumb,
          synopsis: attr.synopsis || null,
          airdate: attr.airdate || null,
        });
      }
    }

    memoryCache.set(cacheKey, formatted, 24 * 60 * 60); // 24 horas de caché
    return formatted;
  } catch (e) {
    console.warn(`Error obteniendo episodios de Kitsu para kitsuId ${kitsuId}:`, e.message);
    return [];
  }
}

module.exports = {
  searchAnimeMetadata,
  getTopAnimeMetadata,
  getAnimeByIdMetadata,
  getRecommendationsMetadata,
  getAnimeEpisodesThumbnails,
  memoryCache,
};
