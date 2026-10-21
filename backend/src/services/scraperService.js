const axios = require('axios');
const cheerio = require('cheerio');
const { FLV_BASE_URL, HEADERS } = require('../config/constants');
const { memoryCache } = require('./jikanService');

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
 * Extrae servidores de video de AnimeFLV desde var videos = {"SUB": [...], "LAT": [...]}
 * Protegido contra cambios de ofuscación y fallos de cheerio.
 */
async function getFlvServers(slug, episodeNumber, audioKey) {
  try {
    const episodeUrl = `${FLV_BASE_URL}/ver/${slug}-${episodeNumber}`;
    const { data } = await axios.get(episodeUrl, { headers: HEADERS, timeout: 3000 });

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
 * Extrae servidores reales listos para iframe desde Jkanime con decodificación Base64 estricta
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
        timeout: 3500,
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
            // Decodificación Base64 con try/catch estricto
            try {
              if (!item || !item.remote || typeof item.remote !== 'string') return null;
              const decoded = Buffer.from(item.remote.trim(), 'base64').toString('utf8').trim();
              if (!decoded || !decoded.startsWith('http')) return null;

              // Descartar descargas directas de mediafire u otros no embebibles
              if (decoded.includes('mediafire.com')) return null;

              return {
                server: item.server || 'Stream',
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
      // Si falla una variación de slug, continúa con la siguiente sin lanzar error
    }
  }

  return [];
}

/**
 * Obtiene los servidores reales ordenados y mapeados para los botones:
 * - Botón 1: "Sora HD"
 * - Botón 2: "Nube"
 * - Botón 3: "Espejo"
 * Envuelto en try/catch general para garantizar que el servidor Express nunca crashee.
 */
async function getEpisodeServers(slug, episodeNumber, audioKey = 'SUB') {
  try {
    const cacheKey = `servers:${slug}:${episodeNumber}:${audioKey}`;
    if (memoryCache && memoryCache.get) {
      const cached = memoryCache.get(cacheKey);
      if (cached) return cached;
    }

    const uiNames = ['Sora HD', 'Nube', 'Espejo'];

    // 1. Probar AnimeFLV (var videos = ...) con manejo seguro
    try {
      const flvServers = await getFlvServers(slug, episodeNumber, audioKey);
      if (Array.isArray(flvServers) && flvServers.length > 0) {
        const mapped = flvServers.slice(0, 3).map((srv, idx) => ({
          id: idx,
          name: uiNames[idx] || srv.server,
          originalServer: srv.server,
          embedUrl: srv.url,
        }));
        if (memoryCache && memoryCache.set) {
          memoryCache.set(cacheKey, mapped, 2 * 60 * 60); // 2 horas de caché
        }
        return mapped;
      }
    } catch (flvErr) {
      console.warn('Error en getFlvServers:', flvErr.message);
    }

    // 2. Probar JKAnime (var servers = [...] decodificado en Base64) con manejo seguro
    try {
      const jkServers = await getJkanimeServers(slug, episodeNumber, audioKey);
      if (Array.isArray(jkServers) && jkServers.length > 0) {
        const mapped = jkServers.slice(0, 3).map((srv, idx) => ({
          id: idx,
          name: uiNames[idx] || srv.server,
          originalServer: srv.server,
          embedUrl: srv.url,
        }));
        if (memoryCache && memoryCache.set) {
          memoryCache.set(cacheKey, mapped, 2 * 60 * 60);
        }
        return mapped;
      }
    } catch (jkErr) {
      console.warn('Error en getJkanimeServers:', jkErr.message);
    }

    // 3. Servidores de respaldo con reproductores estándar si las fuentes no responden
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
