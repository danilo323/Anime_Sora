const axios = require('axios');
const cheerio = require('cheerio');
const { FLV_BASE_URL, HEADERS } = require('../config/constants');
const { memoryCache } = require('./jikanService');

const TIO_BASE_URL = 'https://tioanime.com';

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

// Palabras de parada universales para comparar títulos de forma precisa
const STOP_WORDS = new Set([
  'the',
  'la',
  'el',
  'los',
  'las',
  'de',
  'del',
  'y',
  'and',
  'no',
  'a',
  'an',
  'in',
  'on',
  'of',
  'to',
  'for',
  'with',
  'season',
  'temporada',
  'part',
  'parte',
  'arc',
  'saga',
  'serie',
  'series',
  'anime',
  'pelicula',
  'movie',
  'ova',
  'special',
  'capitulo',
  'episode',
  'ep',
]);

// Mapeo universal de numerales en texto a dígitos
const NUM_WORDS = {
  1: 1,
  one: 1,
  uno: 1,
  first: 1,
  primer: 1,
  primero: 1,
  primera: 1,
  i: 1,
  2: 2,
  two: 2,
  dos: 2,
  second: 2,
  segundo: 2,
  segunda: 2,
  ii: 2,
  3: 3,
  three: 3,
  tres: 3,
  third: 3,
  tercer: 3,
  tercero: 3,
  tercera: 3,
  iii: 3,
  4: 4,
  four: 4,
  cuatro: 4,
  fourth: 4,
  cuarto: 4,
  cuarta: 4,
  iv: 4,
  5: 5,
  five: 5,
  cinco: 5,
  fifth: 5,
  quinto: 5,
  quinta: 5,
  v: 5,
  6: 6,
  six: 6,
  seis: 6,
  sixth: 6,
  sexto: 6,
  sexta: 6,
  vi: 6,
  7: 7,
  seven: 7,
  siete: 7,
  seventh: 7,
  septimo: 7,
  septima: 7,
  vii: 7,
  8: 8,
  eight: 8,
  ocho: 8,
  eighth: 8,
  octavo: 8,
  octava: 8,
  viii: 8,
  9: 9,
  nine: 9,
  nueve: 9,
  ninth: 9,
  noveno: 9,
  novena: 9,
  ix: 9,
  10: 10,
  ten: 10,
  diez: 10,
  tenth: 10,
  decimo: 10,
  decima: 10,
  x: 10,
};

// Extrae números y ordinales presentes en cualquier texto
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

// Algoritmo universal de similitud basado en overlap de tokens y compatibilidad de temporada
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

  // Recompensa si coinciden en número de temporada/parte; penaliza si difieren
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
    else numberScore -= 6;
  }

  // Solapamiento de palabras clave
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

// Convierte un título en un slug limpio de respaldo
function slugifyTitle(title = '') {
  try {
    return String(title || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  } catch (_) {
    return 'anime';
  }
}

/**
 * Normalizaciones lingüísticas universales aplicables a cualquier título/slug
 * (sin acoplar nombres de series específicas).
 */
function getUniversalSlugVariations(slug, audioKey = 'SUB') {
  const norm = String(slug || '').toLowerCase().trim();
  const clean = norm.replace(/-latino$/i, '');
  const list = [];

  if (audioKey === 'LAT') {
    list.push(`${clean}-latino`, `${clean}-audio-latino`);
  }

  list.push(slug, clean);

  // Variaciones fonéticas y estructurales universales
  list.push(
    clean.replace(/-season-\d+/g, ''),
    clean.replace(/-\d+(st|nd|rd|th)-season/g, ''),
    clean.replace(/uu/g, 'u'),
    clean.replace(/ou/g, 'o'),
    clean.replace(/-tv/g, ''),
    clean.replace(/-shippuuden/g, '-shippuden')
  );

  return Array.from(new Set(list.filter(Boolean)));
}

/**
 * Extrae la URL limpia (el src="..." o URL directa) usando expresiones regulares.
 * Filtra formatos de iframe, URLs inválidas, vacías o enlaces de descarga no embebibles.
 */
function extractCleanUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str) return null;

  // 1. Extraer URL de iframe si viene en tag HTML <iframe ... src="..." ...>
  const iframeMatch = str.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i);
  let url = iframeMatch && iframeMatch[1] ? iframeMatch[1].trim() : str;

  // 2. Si viene con protocolo relativo //
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }

  // 3. Extraer la URL limpia con regex de http(s)
  const httpMatch = url.match(/https?:\/\/[^\s"'<>]+/i);
  if (!httpMatch) return null;

  url = httpMatch[0].trim();

  // 4. Filtrar enlaces no válidos o incompatibles con reproductor iframe
  if (
    url.includes('mediafire.com') ||
    url.includes('drive.google.com/uc') ||
    url.endsWith('.rar') ||
    url.endsWith('.zip') ||
    url.includes('about:blank')
  ) {
    return null;
  }

  return url;
}

/**
 * Normaliza una URL para detectar duplicados exactos
 */
function normalizeForDedup(url) {
  try {
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
      .replace(/[?&]token=[^&]+/, '');
  } catch (_) {
    return url;
  }
}

/**
 * Búsqueda dinámica y universal en el directorio de TioAnime.
 * Se ejecuta únicamente cuando un slug no coincide de forma directa.
 */
async function searchTioAnimeDirectory(slug) {
  const cacheKey = `dir:tio:${slug}`;
  if (memoryCache && memoryCache.get) {
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;
  }

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
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 2500,
      });

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

  // Ordenar candidatos por similitud universal (umbral mínimo para evitar falsos positivos)
  const ranked = items
    .map((item) => ({
      ...item,
      score: calculateSimilarity(slug, item.title, item.slug),
    }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  const bestSlugs = ranked.map((r) => r.slug);

  if (memoryCache && memoryCache.set) {
    memoryCache.set(cacheKey, bestSlugs, 24 * 60 * 60);
  }

  return bestSlugs;
}

/**
 * Motor 1: Extrae servidores de video de AnimeFLV desde var videos = {"SUB": [...], "LAT": [...]}
 */
async function getFlvServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = getUniversalSlugVariations(slug, audioKey);

  for (const s of candidateSlugs) {
    try {
      const episodeUrl = `${FLV_BASE_URL}/ver/${s}-${episodeNumber}`;
      const { data } = await axios.get(episodeUrl, { headers: HEADERS, timeout: 2500 });

      let $;
      try {
        $ = cheerio.load(data);
      } catch (_) {
        continue;
      }

      let rawVideos = {};
      try {
        $('script').each((_, el) => {
          try {
            const scriptContent = $(el).html() || '';
            const match = scriptContent.match(/var videos = (\{[\s\S]*?\});/);
            if (match && match[1]) {
              try {
                rawVideos = JSON.parse(match[1]);
              } catch (_) {}
            }
          } catch (_) {}
        });
      } catch (_) {}

      let selectedList = [];
      if (audioKey === 'LAT') {
        selectedList = Array.isArray(rawVideos.LAT)
          ? rawVideos.LAT
          : Array.isArray(rawVideos.SUB)
          ? rawVideos.SUB
          : [];
      } else {
        selectedList = Array.isArray(rawVideos.SUB) ? rawVideos.SUB : [];
      }

      const results = selectedList
        .map((srv) => {
          try {
            const rawUrl = srv.code || srv.url || '';
            const cleanUrl = extractCleanUrl(rawUrl);
            if (!cleanUrl) return null;
            return {
              server: srv.title || srv.server || 'FLV',
              url: cleanUrl,
            };
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);

      if (results.length > 0) return results;
    } catch (_) {
      // Continuar con siguiente candidato
    }
  }

  return [];
}

/**
 * Motor 2: Extrae servidores desde TioAnime (var videos = [["Server", "Url", ...], ...])
 * Con búsqueda dinámica universal si las variaciones iniciales no coinciden.
 */
async function getTioAnimeServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = getUniversalSlugVariations(slug, audioKey);

  // 1. Probar variaciones inmediatas
  for (const s of candidateSlugs) {
    try {
      const url = `${TIO_BASE_URL}/ver/${s}-${episodeNumber}`;
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 2800,
      });

      if (!data || typeof data !== 'string') continue;

      const match = data.match(/var videos = (\[[\s\S]*?\]);/);
      if (match && match[1]) {
        let list = [];
        try {
          list = JSON.parse(match[1]);
        } catch (_) {
          continue;
        }

        if (!Array.isArray(list)) continue;

        const results = list
          .map((item) => {
            try {
              if (!Array.isArray(item) || item.length < 2) return null;
              const server = String(item[0] || 'TioStream');
              const rawUrl = String(item[1] || '').trim();
              const cleanUrl = extractCleanUrl(rawUrl);

              if (!cleanUrl) return null;

              return { server, url: cleanUrl };
            } catch (_) {
              return null;
            }
          })
          .filter(Boolean);

        if (results.length > 0) return results;
      }
    } catch (_) {
      // Continuar
    }
  }

  // 2. Búsqueda dinámica universal si falló la coincidencia literal
  try {
    const discoveredSlugs = await searchTioAnimeDirectory(slug);
    for (const ds of discoveredSlugs.slice(0, 4)) {
      if (candidateSlugs.includes(ds)) continue;
      try {
        const epUrl = `${TIO_BASE_URL}/ver/${ds}-${episodeNumber}`;
        const epRes = await axios.get(epUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          },
          timeout: 2500,
        });

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

/**
 * Motor 3 (Auxiliar / Respaldo): Extrae servidores reales desde JKAnime con decodificación Base64 estricta
 */
async function getJkanimeServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = getUniversalSlugVariations(slug, audioKey);

  for (const s of candidateSlugs) {
    try {
      const url = `https://jkanime.net/${s}/${episodeNumber}/`;
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 2800,
      });

      if (!data || typeof data !== 'string') continue;

      const match = data.match(/var servers = (\[[\s\S]*?\]);/);
      if (match && match[1]) {
        let list = [];
        try {
          list = JSON.parse(match[1]);
        } catch (_) {
          continue;
        }

        if (!Array.isArray(list)) continue;

        const embeds = list
          .map((item) => {
            try {
              if (!item || !item.remote || typeof item.remote !== 'string') return null;
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
    } catch (_) {
      // Continuar con siguiente candidato
    }
  }

  return [];
}

/**
 * Rastreo Dinámico de Reproductores en Tiempo Real:
 * 1. Lanza peticiones concurrentes a múltiples fuentes mediante Promise.allSettled.
 * 2. Recopila todos los iframes o URLs encontradas en las fuentes.
 * 3. Extrae la URL limpia (el src="...") usando expresiones regulares.
 * 4. Elimina enlaces duplicados y URLs inválidas o vacías.
 * 5. Mapea los resultados dinámicamente según el tamaño real del arreglo (sin longitud fija forzada).
 */
async function getEpisodeServers(slug, episodeNumber, audioKey = 'SUB') {
  try {
    const cacheKey = `servers:${slug}:${episodeNumber}:${audioKey}`;
    if (memoryCache && memoryCache.get) {
      const cached = memoryCache.get(cacheKey);
      if (cached) return cached;
    }

    // 1. Peticiones concurrentes a las fuentes de streaming mediante Promise.allSettled
    const [flvResult, tioResult, jkResult] = await Promise.allSettled([
      getFlvServers(slug, episodeNumber, audioKey),
      getTioAnimeServers(slug, episodeNumber, audioKey),
      getJkanimeServers(slug, episodeNumber, audioKey),
    ]);

    // 2. Recopilar todos los servidores/iframes encontrados
    const flvServers =
      flvResult.status === 'fulfilled' && Array.isArray(flvResult.value) ? flvResult.value : [];
    const tioServers =
      tioResult.status === 'fulfilled' && Array.isArray(tioResult.value) ? tioResult.value : [];
    const jkServers =
      jkResult.status === 'fulfilled' && Array.isArray(jkResult.value) ? jkResult.value : [];

    const rawCombined = [...flvServers, ...tioServers, ...jkServers];

    // 3 & 4. Extraer URLs limpias mediante regex, filtrar inválidas/vacías y eliminar duplicados
    const seenUrls = new Set();
    const cleanServers = [];

    for (const item of rawCombined) {
      if (!item) continue;
      const cleanUrl = extractCleanUrl(item.url || item.code || '');
      if (!cleanUrl) continue;

      const normKey = normalizeForDedup(cleanUrl);
      if (seenUrls.has(normKey)) continue;
      seenUrls.add(normKey);

      cleanServers.push({
        server: item.server || 'Directo',
        url: cleanUrl,
      });
    }

    // 5. Mapeo dinámico: no forzar longitud fija, iterar sobre el tamaño real del arreglo
    if (cleanServers.length > 0) {
      const mapped = cleanServers.map((srv, idx) => ({
        id: idx,
        name: UI_SERVER_NAMES[idx] || `Servidor ${idx + 1}`,
        originalServer: srv.server,
        embedUrl: srv.url,
      }));

      if (memoryCache && memoryCache.set) {
        memoryCache.set(cacheKey, mapped, 2 * 60 * 60); // 2 horas de caché
      }

      return mapped;
    }

    // 6. Servidores de respaldo (9 proveedores) si ninguna fuente externa respondió
    const clean = String(slug || '').replace(/-latino$/i, '');
    const fallbacks = [
      {
        id: 0,
        name: 'Sora HD',
        originalServer: 'MegaCloud',
        embedUrl: `https://vidsrc.cc/v2/embed/tv/${clean}/1/${episodeNumber}`,
      },
      {
        id: 1,
        name: 'Nube',
        originalServer: 'VidSrc',
        embedUrl: `https://www.vidsrc.party/embed/tv/${clean}/1/${episodeNumber}`,
      },
      {
        id: 2,
        name: 'Espejo',
        originalServer: 'StreamWish',
        embedUrl: `https://embed.su/embed/anime/${clean}/${episodeNumber}`,
      },
      {
        id: 3,
        name: 'Titán',
        originalServer: 'SuperEmbed',
        embedUrl: `https://multiembed.mov/?video_id=${clean}&s=1&e=${episodeNumber}`,
      },
      {
        id: 4,
        name: 'Fénix',
        originalServer: 'AutoEmbed',
        embedUrl: `https://player.autoembed.cc/embed/tv/${clean}/1/${episodeNumber}`,
      },
      {
        id: 5,
        name: 'Delta',
        originalServer: 'VidLink',
        embedUrl: `https://vidlink.pro/tv/${clean}/1/${episodeNumber}`,
      },
      {
        id: 6,
        name: 'Nova',
        originalServer: '2Embed',
        embedUrl: `https://www.2embed.cc/embedtv/${clean}&s=1&e=${episodeNumber}`,
      },
      {
        id: 7,
        name: 'Zenith',
        originalServer: 'SmashyStream',
        embedUrl: `https://player.smashystream.com/tv/${clean}/1/${episodeNumber}`,
      },
      {
        id: 8,
        name: 'Solar',
        originalServer: 'Moviee',
        embedUrl: `https://moviee.tv/embed/tv/${clean}/1/${episodeNumber}`,
      },
    ];

    return fallbacks;
  } catch (fatalErr) {
    console.error('Error fatal no capturado en getEpisodeServers:', fatalErr.message);
    return [];
  }
}

module.exports = {
  slugifyTitle,
  getEpisodeServers,
  extractCleanUrl,
  calculateSimilarity,
};
