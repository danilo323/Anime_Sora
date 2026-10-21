const axios = require('axios');
const cheerio = require('cheerio');
const { FLV_BASE_URL, HEADERS } = require('../config/constants');
const { memoryCache } = require('./jikanService');

// Normaliza textos para comparar títulos con precisión
function normalizeTitle(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

// Convierte un título en un slug limpio de respaldo
function slugifyTitle(title = '') {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Busca los slugs disponibles en el catálogo de streaming
 */
async function findLanguageSlugs(query) {
  try {
    const url = `${FLV_BASE_URL}/browse?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 2500 });
    const $ = cheerio.load(data);

    const results = [];
    $('.ListAnimes li article').each((_, el) => {
      const href = $(el).find('a').attr('href') || '';
      const title = $(el).find('h3.Title').text().trim();
      const slug = href.replace('/anime/', '').replace(/\//g, '').trim();
      if (slug) {
        results.push({ title, normTitle: normalizeTitle(title), slug });
      }
    });

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
  } catch (_) {
    return { slugJap: null, slugLat: null, allMatches: [] };
  }
}

/**
 * Extrae servidores de video de AnimeFLV desde var videos = {"SUB": [...], "LAT": [...]}
 */
async function getFlvServers(slug, episodeNumber, audioKey) {
  try {
    const episodeUrl = `${FLV_BASE_URL}/ver/${slug}-${episodeNumber}`;
    const { data } = await axios.get(episodeUrl, { headers: HEADERS, timeout: 3000 });
    const $ = cheerio.load(data);

    let rawVideos = {};
    $('script').each((_, el) => {
      const scriptContent = $(el).html() || '';
      const match = scriptContent.match(/var videos = (\{[\s\S]*?\});/);
      if (match && match[1]) {
        try {
          rawVideos = JSON.parse(match[1]);
        } catch (_) {}
      }
    });

    let selectedList = [];
    if (audioKey === 'LAT') {
      selectedList = rawVideos.LAT || rawVideos.SUB || [];
    } else {
      selectedList = rawVideos.SUB || [];
    }

    return selectedList
      .map((srv) => ({
        server: srv.title || srv.server || 'FLV',
        url: srv.code || srv.url || '',
      }))
      .filter((s) => s.url && s.url.startsWith('http'));
  } catch (_) {
    return [];
  }
}

/**
 * Extrae servidores reales listos para iframe desde Jkanime con decodificación Base64
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

      const match = data.match(/var servers = (\[[\s\S]*?\]);/);
      if (match && match[1]) {
        const list = JSON.parse(match[1]);
        const embeds = list
          .map((item) => {
            try {
              const decoded = Buffer.from(item.remote, 'base64').toString('utf8').trim();
              return {
                server: item.server || 'Stream',
                lang: Number(item.lang),
                url: decoded,
              };
            } catch (_) {
              return null;
            }
          })
          .filter((item) => {
            if (!item || !item.url) return false;
            // Descartar enlaces de descarga no embebibles
            if (item.url.includes('mediafire.com')) return false;
            return item.url.startsWith('http');
          });

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

/**
 * Obtiene los servidores reales ordenados y mapeados para los botones:
 * - Botón 1: "Sora HD"
 * - Botón 2: "Nube"
 * - Botón 3: "Espejo"
 */
async function getEpisodeServers(slug, episodeNumber, audioKey = 'SUB') {
  const cacheKey = `servers:${slug}:${episodeNumber}:${audioKey}`;
  if (memoryCache && memoryCache.get) {
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;
  }

  const uiNames = ['Sora HD', 'Nube', 'Espejo'];

  // 1. Probar AnimeFLV (var videos = ...)
  const flvServers = await getFlvServers(slug, episodeNumber, audioKey);
  if (flvServers.length > 0) {
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

  // 2. Probar JKAnime (var servers = [...] decodificado en Base64)
  const jkServers = await getJkanimeServers(slug, episodeNumber, audioKey);
  if (jkServers.length > 0) {
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

  // 3. Servidores de respaldo con reproductores estándar si las fuentes no responden
  const clean = slug.replace(/-latino$/i, '');
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
}

module.exports = {
  slugifyTitle,
  findLanguageSlugs,
  getEpisodeServers,
};
