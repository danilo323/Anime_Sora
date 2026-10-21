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

// Normaliza textos para comparar títulos con precisión
function normalizeTitle(str = '') {
  try {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  } catch (_) {
    return '';
  }
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
 * Resuelve y genera candidatos inteligentes de slugs en español,
 * contemplando sagas como Avatar (Libro 1 Agua, Libro 2 Tierra, Libro 3 Fuego), Korra,
 * temporadas y adaptaciones de títulos en inglés hacia español.
 */
async function resolveSlugCandidates(slug, audioKey = 'SUB') {
  const norm = String(slug || '').toLowerCase().trim();
  const clean = norm.replace(/-latino$/i, '');
  const candidates = [];

  // 1. Reglas específicas para la saga Avatar / Aang / Korra
  if (norm.includes('avatar') || norm.includes('aang') || norm.includes('korra')) {
    if (norm.includes('korra')) {
      candidates.push('avatar-la-leyenda-de-korra');
    }
    if (norm.includes('book-1') || norm.includes('water') || norm.includes('agua') || norm.includes('uno')) {
      candidates.push('avatar-libro-uno');
    }
    if (norm.includes('book-2') || norm.includes('earth') || norm.includes('tierra') || norm.includes('dos')) {
      candidates.push('avatar-libro-dos');
    }
    if (norm.includes('book-3') || norm.includes('fire') || norm.includes('fuego') || norm.includes('tres')) {
      candidates.push('avatar-libro-tres');
    }
    candidates.push('avatar-libro-uno', 'avatar-libro-dos', 'avatar-libro-tres', 'avatar-la-leyenda-de-korra');
  }

  if (audioKey === 'LAT') {
    candidates.push(`${clean}-latino`, `${clean}-audio-latino`);
  }

  candidates.push(slug, clean);

  // 2. Normalizaciones habituales de títulos
  candidates.push(
    clean.replace(/the-last-airbender-book-1-water/g, 'libro-uno'),
    clean.replace(/the-last-airbender-book-2-earth/g, 'libro-dos'),
    clean.replace(/the-last-airbender-book-3-fire/g, 'libro-tres'),
    clean.replace(/the-last-airbender/g, 'avatar'),
    clean.replace(/-season-\d+/g, ''),
    clean.replace(/-\d+(st|nd|rd|th)-season/g, ''),
    clean.replace(/uu/g, 'u'),
    clean.replace(/ou/g, 'o'),
    clean.replace(/-tv/g, ''),
    clean.replace(/-shippuuden/g, '-shippuden')
  );

  return Array.from(new Set(candidates.filter(Boolean)));
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
 * Busca los slugs disponibles en el catálogo de streaming (protegido contra fallos)
 */
async function findLanguageSlugs(query) {
  try {
    const url = `${FLV_BASE_URL}/browse?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 2500 });

    let $;
    try {
      $ = cheerio.load(data);
    } catch (parseErr) {
      console.warn('Cheerio fallo parseando HTML en findLanguageSlugs:', parseErr.message);
      return { slugJap: null, slugLat: null, allMatches: [] };
    }

    const results = [];
    try {
      $('.ListAnimes li article').each((_, el) => {
        try {
          const href = $(el).find('a').attr('href') || '';
          const title = $(el).find('h3.Title').text().trim();
          const slug = href.replace('/anime/', '').replace(/\//g, '').trim();
          if (slug) {
            results.push({ title, normTitle: normalizeTitle(title), slug });
          }
        } catch (_) {}
      });
    } catch (_) {}

    let slugJap = null;
    let slugLat = null;

    results.forEach((item) => {
      const isLatino = item.normTitle.includes('latino') || item.slug.includes('latino');
      if (isLatino) {
        if (!slugLat) slugLat = item.slug;
      } else {
        if (!slugJap) slugJap = item.slug;
      }
    });

    return { slugJap, slugLat, allMatches: results };
  } catch (error) {
    return { slugJap: null, slugLat: null, allMatches: [] };
  }
}

/**
 * Motor 1: Extrae servidores de video de AnimeFLV desde var videos = {"SUB": [...], "LAT": [...]}
 * Extrae URLs o iframes mediante expresiones regulares.
 */
async function getFlvServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = await resolveSlugCandidates(slug, audioKey);

  for (const s of candidateSlugs) {
    try {
      const episodeUrl = `${FLV_BASE_URL}/ver/${s}-${episodeNumber}`;
      const { data } = await axios.get(episodeUrl, { headers: HEADERS, timeout: 2500 });

      let $;
      try {
        $ = cheerio.load(data);
      } catch (cheerioErr) {
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
        selectedList = Array.isArray(rawVideos.LAT) ? rawVideos.LAT : (Array.isArray(rawVideos.SUB) ? rawVideos.SUB : []);
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
 * Con soporte para resolución dinámica de slugs (Avatar, Korra, sagas) y búsqueda en directorio.
 */
async function getTioAnimeServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = await resolveSlugCandidates(slug, audioKey);

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

        if (results.length > 0) {
          return results;
        }
      }
    } catch (_) {
      // Continuar con siguiente candidato
    }
  }

  // Búsqueda dinámica en directorio si ninguna variación directa funcionó
  try {
    const cleanSlug = slug.replace(/-latino$/i, '').toLowerCase();
    const words = cleanSlug.split('-').filter((w) => w.length > 2 && !['the', 'and', 'book', 'season'].includes(w));
    const searchQuery = words[0] || cleanSlug;
    if (searchQuery) {
      const dirUrl = `${TIO_BASE_URL}/directorio?q=${encodeURIComponent(searchQuery)}`;
      const { data } = await axios.get(dirUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 2500,
      });

      const $ = cheerio.load(data);
      const dirSlugs = [];
      $('.anime a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.startsWith('/anime/')) {
          dirSlugs.push(href.replace('/anime/', ''));
        }
      });

      for (const ds of dirSlugs.slice(0, 4)) {
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
    }
  } catch (_) {}

  return [];
}

/**
 * Motor 3 (Auxiliar / Respaldo): Extrae servidores reales desde JKAnime con decodificación Base64 estricta
 */
async function getJkanimeServers(slug, episodeNumber, audioKey) {
  const candidateSlugs = await resolveSlugCandidates(slug, audioKey);

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
 *    Si encuentra 2 devuelve 2; si encuentra 8 devuelve 8.
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
  findLanguageSlugs,
  getEpisodeServers,
  extractCleanUrl,
  resolveSlugCandidates,
};
