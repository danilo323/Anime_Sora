/**
 * Servicio de extracción de video en ESPAÑOL (Sub Español / Audio Latino)
 * Multi-motor concurrente (TioAnime, JKAnime, AnimeFLV) con ranking de calidad (1080p / 720p)
 * y detección automática de streams nativos (.m3u8 / .mp4).
 */

const axios = require('axios');
const cheerio = require('cheerio');

const TIO_BASE_URL = 'https://tioanime.com';
const JK_BASE_URL = 'https://jkanime.net';
const FLV_BASE_URL = 'https://www3.animeflv.net';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

const UI_SERVER_NAMES = [
  'Sora HD',
  'Nube',
  'Espejo',
  'Titán',
  'Fénix',
  'Delta',
  'Nova',
  'Zenith',
  'Solar',
  'Aura',
  'Eclipse',
  'Vórtice',
  'Estrella',
  'Cometa',
  'Nebulosa',
];

// Puntuación de calidad por servidor para priorizar 1080p Full HD primero
const PROVIDER_QUALITY = {
  mega: { score: 100, label: '1080p Full HD', resolution: '1080p' },
  streamwish: { score: 92, label: '1080p HD', resolution: '1080p' },
  filemoon: { score: 90, label: '1080p HD', resolution: '1080p' },
  voe: { score: 88, label: '1080p HD', resolution: '1080p' },
  mp4upload: { score: 85, label: '1080p Fansub', resolution: '1080p' },
  streamsb: { score: 78, label: '720p HD', resolution: '720p' },
  yourupload: { score: 75, label: '720p HD', resolution: '720p' },
  okru: { score: 72, label: '720p HD', resolution: '720p' },
  vidguard: { score: 70, label: '720p HD', resolution: '720p' },
  mixdrop: { score: 65, label: '720p HD', resolution: '720p' },
  streamtape: { score: 60, label: '720p HD', resolution: '720p' },
  doodstream: { score: 58, label: '720p HD', resolution: '720p' },
  amus: { score: 50, label: '480p SD', resolution: '480p' },
  mepu: { score: 48, label: '480p SD', resolution: '480p' },
  netu: { score: 40, label: '480p SD', resolution: '480p' },
  default: { score: 50, label: 'Estándar', resolution: '720p' },
};

function getQualityInfo(serverName = '') {
  const norm = String(serverName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, val] of Object.entries(PROVIDER_QUALITY)) {
    if (key !== 'default' && norm.includes(key)) {
      return val;
    }
  }
  return PROVIDER_QUALITY.default;
}

// Palabras de parada universales
const STOP_WORDS = new Set([
  'the', 'la', 'el', 'los', 'las', 'de', 'del', 'y', 'and', 'no', 'a', 'an', 'in', 'on', 'of', 'to', 'for', 'with',
  'season', 'temporada', 'part', 'parte', 'arc', 'saga', 'serie', 'series', 'anime', 'movie', 'pelicula', 'ova',
  'special', 'capitulo', 'episode', 'ep',
]);

// Mapeo universal de ordinales y nombres de temporada (inglés y español)
const NUM_WORDS = {
  1: 1, one: 1, uno: 1, first: 1, primer: 1, primero: 1, primera: 1, i: 1, water: 1, agua: 1,
  2: 2, two: 2, dos: 2, second: 2, segundo: 2, segunda: 2, ii: 2, earth: 2, tierra: 2,
  3: 3, three: 3, tres: 3, third: 3, tercer: 3, tercero: 3, tercera: 3, iii: 3, fire: 3, fuego: 3,
  4: 4, four: 4, cuatro: 4, fourth: 4, cuarto: 4, cuarta: 4, iv: 4, air: 4, aire: 4,
  5: 5, five: 5, cinco: 5, fifth: 5, quinto: 5, quinta: 5, v: 5,
  6: 6, six: 6, seis: 6, vi: 6,
  7: 7, seven: 7, siete: 7, vii: 7,
  8: 8, eight: 8, ocho: 8, viii: 8,
  9: 9, nine: 9, nueve: 9, ix: 9,
  10: 10, ten: 10, diez: 10, x: 10,
};

function extractNumbers(str = '') {
  const nums = new Set();
  const tokens = String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      nums.add(Number(t));
    } else if (NUM_WORDS[t]) {
      nums.add(NUM_WORDS[t]);
    }
  }
  return nums;
}

// Algoritmo de similitud difusa para títulos y temporadas
function calculateSimilarity(targetSlug, candidateTitle, candidateSlug) {
  const targetTokens = String(targetSlug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  const candTokens = `${candidateTitle || ''} ${candidateSlug || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  const targetNums = extractNumbers(targetSlug);
  const candNums = extractNumbers(`${candidateTitle || ''} ${candidateSlug || ''}`);

  let numberScore = 0;
  if (targetNums.size > 0 && candNums.size > 0) {
    let matchFound = false;
    for (const tn of targetNums) {
      if (candNums.has(tn)) {
        matchFound = true;
        break;
      }
    }
    if (matchFound) numberScore += 12;
    else numberScore -= 8; // Fuerte penalización si la temporada no coincide
  }

  let overlap = 0;
  for (const t of targetTokens) {
    if (candTokens.includes(t)) {
      overlap += 2;
    } else if (candTokens.some((ct) => ct.includes(t) || t.includes(ct))) {
      overlap += 1;
    }
  }

  return overlap + numberScore;
}

function slugifyTitle(title = '') {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function getUniversalSlugVariations(slug, audioKey = 'SUB') {
  const norm = String(slug || '').toLowerCase().trim();
  const clean = norm.replace(/-latino$/i, '');
  const candidates = [];

  if (audioKey === 'LAT') {
    candidates.push(`${clean}-latino`);
    candidates.push(`${clean}-audio-latino`);
  }

  candidates.push(clean);
  candidates.push(norm);

  // Variaciones de temporada: season-2 -> 2nd-season, 2, s2
  if (clean.includes('-season-')) {
    candidates.push(clean.replace('-season-', '-tv-'));
    candidates.push(clean.replace('-season-', '-'));
    candidates.push(clean.replace('-season-', '-2nd-season'));
  }

  // Traducción universal de números ordinales (inglés -> español)
  let translated = clean;
  if (translated.includes('book-1') || translated.includes('book-one') || translated.includes('water')) {
    translated = translated.replace(/book-\d+|book-[a-z]+/g, 'libro-uno');
    candidates.push(translated);
  }
  if (translated.includes('book-2') || translated.includes('book-two') || translated.includes('earth')) {
    translated = translated.replace(/book-\d+|book-[a-z]+/g, 'libro-dos');
    candidates.push(translated);
  }
  if (translated.includes('book-3') || translated.includes('book-three') || translated.includes('fire')) {
    translated = translated.replace(/book-\d+|book-[a-z]+/g, 'libro-tres');
    candidates.push(translated);
  }

  return Array.from(new Set(candidates));
}

// Búsqueda dinámica en directorio de TioAnime con ranking
async function searchTioAnimeDirectory(slug) {
  const clean = String(slug || '')
    .toLowerCase()
    .replace(/-latino$/i, '');

  const words = clean.split('-').filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const queries = [words.slice(0, 2).join(' '), words[0]].filter(Boolean);
  const uniqueQueries = Array.from(new Set(queries));

  const items = [];
  for (const q of uniqueQueries) {
    try {
      const url = `${TIO_BASE_URL}/directorio?q=${encodeURIComponent(q)}`;
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 2500 });
      const $ = cheerio.load(data);
      $('.anime a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).find('.title').text().trim();
        if (href.startsWith('/anime/')) {
          items.push({ slug: href.replace('/anime/', ''), title });
        }
      });
      if (items.length > 0) break;
    } catch (_) {}
  }

  const ranked = items
    .map((item) => ({
      ...item,
      score: calculateSimilarity(slug, item.title, item.slug),
    }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  return ranked.map((r) => r.slug);
}

function extractCleanUrl(rawInput = '') {
  try {
    let str = String(rawInput || '').trim();
    if (!str) return null;

    if (str.startsWith('//')) str = `https:${str}`;

    const iframeSrc = str.match(/src=["']([^"']+)["']/i);
    if (iframeSrc && iframeSrc[1]) {
      str = iframeSrc[1].trim();
      if (str.startsWith('//')) str = `https:${str}`;
    }

    if (!/^https?:\/\//i.test(str)) return null;

    // Decodificar Base64 si viene parametrizado
    if (str.includes('embed.php?s=') && str.includes('&v=')) {
      try {
        const parsed = new URL(str);
        const encoded = parsed.searchParams.get('v');
        if (encoded) {
          const dec = Buffer.from(encoded, 'base64').toString('utf8').trim();
          if (/^https?:\/\//i.test(dec)) return dec;
        }
      } catch (_) {}
    }

    return str;
  } catch (_) {
    return null;
  }
}

function normalizeForDedup(url = '') {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, '').toLowerCase();
    const cleanPath = u.pathname.replace(/\/+$/, '');
    return `${domain}:${cleanPath}`;
  } catch (_) {
    return url.toLowerCase().trim();
  }
}

// Motor 1: TioAnime
async function getTioAnimeServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = getUniversalSlugVariations(slug, audioKey);

  for (const s of candidateSlugs) {
    try {
      const url = `${TIO_BASE_URL}/ver/${s}-${episodeNumber}`;
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 2600 });
      if (!data || typeof data !== 'string') continue;

      const match = data.match(/var videos = (\[[\s\S]*?\]);/);
      if (match && match[1]) {
        const list = JSON.parse(match[1]);
        const results = list
          .map((item) => {
            const cleanUrl = extractCleanUrl(item[1]);
            return cleanUrl ? { server: String(item[0] || 'TioStream'), url: cleanUrl } : null;
          })
          .filter(Boolean);

        if (results.length > 0) return results;
      }
    } catch (_) {}
  }

  // Búsqueda en directorio si la coincidencia directa falló
  try {
    const discovered = await searchTioAnimeDirectory(slug);
    for (const ds of discovered.slice(0, 3)) {
      if (candidateSlugs.includes(ds)) continue;
      try {
        const epUrl = `${TIO_BASE_URL}/ver/${ds}-${episodeNumber}`;
        const epRes = await axios.get(epUrl, { headers: HEADERS, timeout: 2500 });
        const match = epRes.data?.match(/var videos = (\[[\s\S]*?\]);/);
        if (match && match[1]) {
          const list = JSON.parse(match[1]);
          const results = list
            .map((item) => {
              const cleanUrl = extractCleanUrl(item[1]);
              return cleanUrl ? { server: String(item[0] || 'TioStream'), url: cleanUrl } : null;
            })
            .filter(Boolean);

          if (results.length > 0) return results;
        }
      } catch (_) {}
    }
  } catch (_) {}

  return [];
}

// Motor 2: JKAnime
async function getJkanimeServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = getUniversalSlugVariations(slug, audioKey);

  for (const s of candidateSlugs) {
    try {
      const url = `${JK_BASE_URL}/${s}/${episodeNumber}/`;
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 2600 });
      if (!data || typeof data !== 'string') continue;

      const match = data.match(/var servers = (\[[\s\S]*?\]);/);
      if (match && match[1]) {
        const list = JSON.parse(match[1]);
        const embeds = list
          .map((item) => {
            try {
              if (!item?.remote) return null;
              const decoded = Buffer.from(item.remote.trim(), 'base64').toString('utf8').trim();
              const cleanUrl = extractCleanUrl(decoded);
              if (!cleanUrl) return null;
              return {
                server: item.server || 'JKStream',
                lang: Number(item.lang) || 1,
                url: cleanUrl,
              };
            } catch (_) {
              return null;
            }
          })
          .filter(Boolean);

        if (embeds.length > 0) {
          if (audioKey === 'LAT') {
            const latOnly = embeds.filter((e) => e.lang !== 1);
            if (latOnly.length > 0) return latOnly;
          }
          return embeds;
        }
      }
    } catch (_) {}
  }

  return [];
}

// Motor 3: AnimeFLV
async function getFlvServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = getUniversalSlugVariations(slug, audioKey);

  for (const s of candidateSlugs) {
    try {
      const episodeUrl = `${FLV_BASE_URL}/ver/${s}-${episodeNumber}`;
      const { data } = await axios.get(episodeUrl, { headers: HEADERS, timeout: 2500 });
      let rawVideos = {};
      const match = data.match(/var videos = (\{[\s\S]*?\});/);
      if (match && match[1]) {
        rawVideos = JSON.parse(match[1]);
      }

      let selectedList = [];
      if (audioKey === 'LAT') {
        selectedList = Array.isArray(rawVideos.LAT) ? rawVideos.LAT : Array.isArray(rawVideos.SUB) ? rawVideos.SUB : [];
      } else {
        selectedList = Array.isArray(rawVideos.SUB) ? rawVideos.SUB : [];
      }

      const results = selectedList
        .map((srv) => {
          const rawUrl = srv.code || srv.url || '';
          const cleanUrl = extractCleanUrl(rawUrl);
          return cleanUrl ? { server: srv.title || srv.server || 'FLV', url: cleanUrl } : null;
        })
        .filter(Boolean);

      if (results.length > 0) return results;
    } catch (_) {}
  }

  return [];
}

// Caché en memoria para respuestas instantáneas
const memoryCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function getCached(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data) {
  memoryCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Función principal: Extrae servidores en ESPAÑOL garantizado
 */
async function getEpisodeServers(slug, episodeNumber, audioKey = 'SUB') {
  const epNum = Number(episodeNumber) || 1;
  const cacheKey = `spanish_servers:${slug}:${epNum}:${audioKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // 1. Peticiones concurrentes a fuentes en español
    const [tioResult, jkResult, flvResult] = await Promise.allSettled([
      getTioAnimeServers(slug, epNum, audioKey),
      getJkanimeServers(slug, epNum, audioKey),
      getFlvServers(slug, epNum, audioKey),
    ]);

    const tioServers = tioResult.status === 'fulfilled' && Array.isArray(tioResult.value) ? tioResult.value : [];
    const jkServers = jkResult.status === 'fulfilled' && Array.isArray(jkResult.value) ? jkResult.value : [];
    const flvServers = flvResult.status === 'fulfilled' && Array.isArray(flvResult.value) ? flvResult.value : [];

    const rawCombined = [...tioServers, ...jkServers, ...flvServers];

    // 2. Extraer URLs limpias y eliminar duplicados
    const seenUrls = new Set();
    const cleanList = [];

    for (const item of rawCombined) {
      if (!item) continue;
      const cleanUrl = extractCleanUrl(item.url || '');
      if (!cleanUrl) continue;

      const normKey = normalizeForDedup(cleanUrl);
      if (seenUrls.has(normKey)) continue;
      seenUrls.add(normKey);

      const qInfo = getQualityInfo(item.server);
      const isM3U8 = cleanUrl.includes('.m3u8');
      const isDirectVideo = isM3U8 || cleanUrl.endsWith('.mp4');

      cleanList.push({
        originalServer: item.server || 'Directo',
        url: cleanUrl,
        embedUrl: cleanUrl,
        score: qInfo.score,
        quality: qInfo.resolution,
        qualityLabel: qInfo.label,
        isM3U8,
        isDirectVideo,
      });
    }

    // 3. Ordenar por calidad: 1080p Full HD primero (Mega, StreamWish, Filemoon, Voe)
    cleanList.sort((a, b) => b.score - a.score);

    if (cleanList.length > 0) {
      const mapped = cleanList.map((srv, idx) => ({
        id: idx,
        name: `${UI_SERVER_NAMES[idx] || `Servidor ${idx + 1}`}`,
        originalServer: srv.originalServer,
        quality: srv.quality,
        desc: `${srv.originalServer} · ${srv.qualityLabel}`,
        embedUrl: srv.embedUrl,
        url: srv.url,
        isM3U8: srv.isM3U8,
        isDirectVideo: srv.isDirectVideo,
      }));

      const payload = {
        sources: mapped,
        servers: mapped,
        subtitles: [],
        headers: {},
      };

      setCached(cacheKey, payload);
      return payload;
    }

    // 4. Servidores de respaldo universales si no se encontró en los motores principales
    const clean = String(slug || '').replace(/-latino$/i, '');
    const fallbacks = [
      {
        id: 0,
        name: 'Sora HD',
        originalServer: 'MegaCloud',
        quality: '1080p',
        desc: 'MegaCloud · 1080p Full HD',
        embedUrl: `https://vidsrc.cc/v2/embed/tv/${clean}/1/${epNum}`,
        url: `https://vidsrc.cc/v2/embed/tv/${clean}/1/${epNum}`,
        isM3U8: false,
        isDirectVideo: false,
      },
      {
        id: 1,
        name: 'Nube',
        originalServer: 'VidSrc',
        quality: '1080p',
        desc: 'VidSrc · 1080p Full HD',
        embedUrl: `https://www.vidsrc.party/embed/tv/${clean}/1/${epNum}`,
        url: `https://www.vidsrc.party/embed/tv/${clean}/1/${epNum}`,
        isM3U8: false,
        isDirectVideo: false,
      },
      {
        id: 2,
        name: 'Espejo',
        originalServer: 'SuperEmbed',
        quality: '720p',
        desc: 'SuperEmbed · 720p HD',
        embedUrl: `https://multiembed.mov/?video_id=${clean}&s=1&e=${epNum}`,
        url: `https://multiembed.mov/?video_id=${clean}&s=1&e=${epNum}`,
        isM3U8: false,
        isDirectVideo: false,
      },
    ];

    return {
      sources: fallbacks,
      servers: fallbacks,
      subtitles: [],
      headers: {},
    };
  } catch (err) {
    console.error('Error en getEpisodeServers:', err.message);
    return { sources: [], servers: [], subtitles: [], headers: {} };
  }
}

module.exports = {
  slugifyTitle,
  getEpisodeServers,
  calculateSimilarity,
};
