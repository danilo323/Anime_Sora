const axios = require('axios');
const cheerio = require('cheerio');
const { FLV_BASE_URL, HEADERS } = require('../config/constants');
const { memoryCache } = require('./jikanService');

const TIO_BASE_URL = 'https://tioanime.com';

const UI_SERVER_NAMES = [
  'Sora HD',
  'Nube',
  'Titán',
  'Fénix',
  'Espejo',
  'Delta',
  'Nova',
  'Zenith',
  'Solar',
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
 * Protegido contra cambios de ofuscación y fallos de cheerio.
 */
async function getFlvServers(slug, episodeNumber, audioKey) {
  try {
    const episodeUrl = `${FLV_BASE_URL}/ver/${slug}-${episodeNumber}`;
    const { data } = await axios.get(episodeUrl, { headers: HEADERS, timeout: 2800 });

    let $;
    try {
      $ = cheerio.load(data);
    } catch (cheerioErr) {
      console.warn('Error en Cheerio al parsear AnimeFLV:', cheerioErr.message);
      return [];
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
            } catch (jsonErr) {
              console.warn('Error al parsear JSON de videos en AnimeFLV:', jsonErr.message);
            }
          }
        } catch (_) {}
      });
    } catch (scriptErr) {
      console.warn('Error recorriendo scripts de AnimeFLV:', scriptErr.message);
    }

    let selectedList = [];
    if (audioKey === 'LAT') {
      selectedList = Array.isArray(rawVideos.LAT) ? rawVideos.LAT : (Array.isArray(rawVideos.SUB) ? rawVideos.SUB : []);
    } else {
      selectedList = Array.isArray(rawVideos.SUB) ? rawVideos.SUB : [];
    }

    return selectedList
      .map((srv) => {
        try {
          return {
            server: srv.title || srv.server || 'FLV',
            url: srv.code || srv.url || '',
          };
        } catch (_) {
          return null;
        }
      })
      .filter((s) => s && s.url && typeof s.url === 'string' && s.url.startsWith('http'));
  } catch (err) {
    return [];
  }
}

/**
 * Motor 2: Extrae servidores desde TioAnime (var videos = [["Server", "Url", ...], ...])
 * Con soporte para slugs limpios y doblaje latino.
 */
async function getTioAnimeServers(slug, episodeNumber, audioKey) {
  const cleanSlug = slug.replace(/-latino$/i, '');
  const candidateSlugs = [];

  if (audioKey === 'LAT') {
    candidateSlugs.push(`${cleanSlug}-latino`, `${cleanSlug}-audio-latino`, slug);
  } else {
    candidateSlugs.push(slug, cleanSlug);
  }

  // Variaciones habituales de slugs en TioAnime
  candidateSlugs.push(
    cleanSlug.replace(/uu/g, 'u'),
    cleanSlug.replace(/ou/g, 'o'),
    cleanSlug.replace(/-tv/g, ''),
    cleanSlug.replace(/-shippuuden/g, '-shippuden')
  );

  const uniqueCandidates = Array.from(new Set(candidateSlugs));

  for (const s of uniqueCandidates) {
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
        } catch (jsonErr) {
          console.warn(`Error al parsear JSON de videos en TioAnime para ${s}:`, jsonErr.message);
          continue;
        }

        if (!Array.isArray(list)) continue;

        const results = list
          .map((item) => {
            try {
              if (!Array.isArray(item) || item.length < 2) return null;
              const server = String(item[0] || 'TioStream');
              const rawUrl = String(item[1] || '').trim();

              if (!rawUrl || !rawUrl.startsWith('http')) return null;
              if (rawUrl.includes('mediafire.com')) return null;

              return { server, url: rawUrl };
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
      // Si falla una variación, continúa con la siguiente
    }
  }

  return [];
}

/**
 * Motor 3 (Alternativo / Respaldo): Extrae servidores reales desde JKAnime con decodificación Base64 estricta
 */
async function getJkanimeServers(slug, episodeNumber, audioKey) {
  const cleanSlug = slug.replace(/-latino$/i, '');
  const candidateSlugs = [
    slug,
    cleanSlug,
    cleanSlug.replace(/uu/g, 'u'),
    cleanSlug.replace(/ou/g, 'o'),
    cleanSlug.replace(/-shippuuden/g, '-shippuden'),
    cleanSlug.replace(/-tv/g, ''),
  ];
  const uniqueCandidates = Array.from(new Set(candidateSlugs));

  for (const s of uniqueCandidates) {
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
        } catch (jsonErr) {
          console.warn(`Error parseando lista de servidores de JKAnime para ${s}:`, jsonErr.message);
          continue;
        }

        if (!Array.isArray(list)) continue;

        const embeds = list
          .map((item) => {
            try {
              if (!item || !item.remote || typeof item.remote !== 'string') return null;
              const decoded = Buffer.from(item.remote.trim(), 'base64').toString('utf8').trim();
              if (!decoded || !decoded.startsWith('http')) return null;
              if (decoded.includes('mediafire.com')) return null;

              return {
                server: item.server || 'JKStream',
                lang: Number(item.lang) || 1,
                url: decoded,
              };
            } catch (b64Err) {
              console.warn('Fallo al decodificar servidor en Base64:', b64Err.message);
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
 * Multi-Scraper Inteligente:
 * 1. Ejecuta en paralelo AnimeFLV, TioAnime y JKAnime con try/catch independientes.
 * 2. Combina los arreglos de todas las fuentes disponibles.
 * 3. Filtra enlaces repetidos, caídos o no embebibles.
 * 4. Mapea la lista combinada a los 9 nombres de la interfaz:
 *    ['Sora HD', 'Nube', 'Titán', 'Fénix', 'Espejo', 'Delta', 'Nova', 'Zenith', 'Solar']
 * 5. Devuelve hasta 9 servidores limpios (.slice(0, 9)).
 */
async function getEpisodeServers(slug, episodeNumber, audioKey = 'SUB') {
  try {
    const cacheKey = `servers:${slug}:${episodeNumber}:${audioKey}`;
    if (memoryCache && memoryCache.get) {
      const cached = memoryCache.get(cacheKey);
      if (cached) return cached;
    }

    // 1 & 2. Ejecutar motores en paralelo con Promise.allSettled y try/catch independientes
    const [flvResult, tioResult, jkResult] = await Promise.allSettled([
      getFlvServers(slug, episodeNumber, audioKey),
      getTioAnimeServers(slug, episodeNumber, audioKey),
      getJkanimeServers(slug, episodeNumber, audioKey),
    ]);

    const flvServers =
      flvResult.status === 'fulfilled' && Array.isArray(flvResult.value) ? flvResult.value : [];
    const tioServers =
      tioResult.status === 'fulfilled' && Array.isArray(tioResult.value) ? tioResult.value : [];
    const jkServers =
      jkResult.status === 'fulfilled' && Array.isArray(jkResult.value) ? jkResult.value : [];

    // 3. Combinar arreglos respetando orden de prioridad
    const combined = [...flvServers, ...tioServers, ...jkServers];

    // 4. Filtrar duplicados, enlaces no seguros o no embebibles
    const seenUrls = new Set();
    const cleanServers = [];

    for (const item of combined) {
      if (!item || !item.url || typeof item.url !== 'string') continue;

      const url = item.url.trim();

      // Debe ser URL http(s)
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      // Descartar descargas o enlaces incompatibles con iframe
      if (
        url.includes('mediafire.com') ||
        url.includes('drive.google.com/uc') ||
        url.endsWith('.rar') ||
        url.endsWith('.zip')
      ) {
        continue;
      }

      // Clave normalizada para deduplicar
      const normKey = url
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')
        .replace(/[?&]token=[^&]+/, '');

      if (seenUrls.has(normKey)) continue;
      seenUrls.add(normKey);

      cleanServers.push({
        server: item.server || 'Directo',
        url,
      });
    }

    // 5. Mapear a los 9 nombres de la interfaz y tomar hasta 9
    if (cleanServers.length > 0) {
      const mapped = cleanServers.slice(0, 9).map((srv, idx) => ({
        id: idx,
        name: UI_SERVER_NAMES[idx] || `Servidor ${idx + 1}`,
        originalServer: srv.server,
        embedUrl: srv.url,
      }));

      if (memoryCache && memoryCache.set) {
        memoryCache.set(cacheKey, mapped, 2 * 60 * 60); // 2 horas en caché
      }

      return mapped;
    }

    // 6. Servidores de respaldo si ninguna fuente respondió
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
        name: 'Titán',
        originalServer: 'StreamWish',
        embedUrl: `https://embed.su/embed/anime/${clean}/${episodeNumber}`,
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
};
