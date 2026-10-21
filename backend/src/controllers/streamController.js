const {
  searchAnimeMetadata,
  getTopAnimeMetadata,
  getAnimeByIdMetadata,
  getRecommendationsMetadata,
  getAnimeEpisodesThumbnails,
} = require('../services/jikanService');
const { getEpisodeServers, getAnimeAiringInfo } = require('../services/scraperService');
const { getTelegramEpisode, isArchiving } = require('../services/telegramVaultService');
const { streamTelegramFile, queueAutoArchive } = require('../services/telegramService');

const LIVE_SERVER_NAMES = [
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

/**
 * GET /api/search?q=nombre
 * Devuelve 1 tarjeta limpia por cada anime (sin duplicar en SUB y LAT)
 */
async function searchAnimeCards(req, res) {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json([]);
  }

  try {
    const results = await searchAnimeMetadata(query, 12);
    res.json(results);
  } catch (error) {
    console.error('Error en searchAnimeCards:', error.message);
    res.status(500).json({ error: 'Error al buscar animes' });
  }
}

/**
 * GET /api/top?limit=10&type=tv|movie
 * Devuelve los animes más populares filtrados opcionalmente por tipo
 */
async function getTopAnime(req, res) {
  const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));
  const type = req.query.type || null;
  try {
    const results = await getTopAnimeMetadata(limit, type);
    res.json(results);
  } catch (error) {
    console.error('Error en getTopAnime:', error.message);
    res.status(500).json({ error: 'Error al obtener top anime' });
  }
}

/**
 * GET /api/anime/:id
 * Devuelve la información detallada de un anime
 */
async function getAnimeById(req, res) {
  const { id } = req.params;
  try {
    const anime = await getAnimeByIdMetadata(id);
    if (!anime) return res.status(404).json({ error: 'Anime no encontrado' });
    res.json(anime);
  } catch (error) {
    console.error(`Error en getAnimeById para ${id}:`, error.message);
    res.status(500).json({ error: 'Error al obtener anime' });
  }
}

/**
 * GET /api/anime/:id/recommendations
 * Devuelve las recomendaciones de un anime
 */
async function getAnimeRecommendations(req, res) {
  const { id } = req.params;
  try {
    const results = await getRecommendationsMetadata(id);
    res.json(results);
  } catch (error) {
    console.error(`Error en getAnimeRecommendations para ${id}:`, error.message);
    res.status(500).json({ error: 'Error al obtener recomendaciones' });
  }
}

/**
 * GET /api/episode/:slug/:ep?audioKey=SUB|LAT
 * Lógica híbrida unificada:
 * 1. Revisa si el episodio ya está guardado en la bóveda de Telegram.
 * 2. Si existe, 'Sora HD' carga desde Telegram a máxima velocidad.
 * 3. Si no existe, entrega los servidores en vivo / Consumet y lanza auto-guardado en segundo plano.
 */
async function getEpisodeStream(req, res) {
  const { slug, ep } = req.params;
  const audioKey = req.query.audioKey || 'SUB';
  try {
    const epNum = Number(ep) || 1;

    // 1. Consulta la base de datos de Telegram
    const tgRecord = getTelegramEpisode(slug, epNum, audioKey);
    const archivingActive = isArchiving(slug, epNum, audioKey);
    const hasTelegramVault = Boolean(tgRecord && tgRecord.telegramMessageId);

    // 2. Extrae servidores en vivo (Consumet / Espejos)
    const data = await getEpisodeServers(slug, epNum, audioKey);

    // Servidor 1: Bóveda Telegram (Indestructible)
    const vaultServer = {
      id: 0,
      name: 'Sora HD',
      originalServer: 'Telegram MTProto',
      quality: '1080p',
      desc: hasTelegramVault
        ? 'Bóveda Telegram · Ultra Rápido e Indestructible'
        : archivingActive
        ? 'Respaldando en Bóveda Telegram en segundo plano…'
        : 'Bóveda Telegram · Auto-archivado pendiente',
      url: hasTelegramVault ? `/api/stream/telegram/${tgRecord.telegramMessageId}` : '',
      embedUrl: hasTelegramVault ? `/api/stream/telegram/${tgRecord.telegramMessageId}` : '',
      isDirectVideo: true,
      isTelegram: true,
      isArchived: hasTelegramVault,
      available: hasTelegramVault,
      isArchiving: archivingActive,
      group: 'vault',
    };

    // Servidores 2 al 9+: Espejos en vivo
    const liveServers = (data?.servers || []).map((s, idx) => ({
      ...s,
      id: idx + 1,
      name: LIVE_SERVER_NAMES[idx] || `Servidor ${idx + 2}`,
      group: 'live',
      available: true,
    }));

    const allServers = [vaultServer, ...liveServers];

    // Auto-archivador en segundo plano si aún no está en Telegram
    if (!hasTelegramVault) {
      const bestCandidate = (data?.sources || []).find(
        (s) => s.isDirectVideo || s.url?.endsWith('.mp4') || s.originalServer === 'Mp4upload' || s.originalServer === 'Voe'
      );
      if (bestCandidate?.url) {
        queueAutoArchive({
          slug,
          episode: epNum,
          audioKey,
          videoUrl: bestCandidate.url,
        });
      }
    }

    res.json({
      slug,
      episode: epNum,
      audioKey,
      hasTelegramVault,
      isArchiving: archivingActive,
      telegramRecord: tgRecord || null,
      vaultServer,
      liveServers,
      servers: allServers,
      sources: data?.sources || [],
      subtitles: data?.subtitles || [],
      headers: data?.headers || {},
      isAiring: Boolean(data?.isAiring),
      hasAired: data?.hasAired !== false,
      maxEpisode: data?.maxEpisode || null,
      status: data?.status || null,
      message: data?.message || null,
    });
  } catch (error) {
    console.error(`Error en getEpisodeStream para ${slug} ep ${ep}:`, error.message);
    res.status(500).json({ error: 'Error al obtener fuentes de video' });
  }
}

/**
 * GET /api/stream/telegram/:id
 * Endpoint de streaming directo desde Telegram con soporte para Range requests (Seek / Pausa / Adelantar)
 */
async function streamTelegramVideo(req, res) {
  const { id } = req.params;
  return streamTelegramFile(id, req, res);
}

/**
 * GET /api/anime/:slug/airing
 * Devuelve información de emisión en tiempo real (último episodio emitido y estado)
 */
async function getAiringStatus(req, res) {
  const { slug } = req.params;
  try {
    const info = await getAnimeAiringInfo(slug);
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/anime/:id/episodes-thumbnails?title=...&limit=...&offset=...
 * Devuelve miniaturas reales de episodios desde Kitsu CDN sin almacenar archivos localmente
 */
async function getEpisodesThumbnails(req, res) {
  const { id } = req.params;
  const title = req.query.title || '';
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  try {
    const list = await getAnimeEpisodesThumbnails({ id, title, limit, offset });
    res.json(list);
  } catch (error) {
    console.error(`Error en getEpisodesThumbnails para ${id}:`, error.message);
    res.json([]);
  }
}

module.exports = {
  searchAnimeCards,
  getTopAnime,
  getAnimeById,
  getAnimeRecommendations,
  getEpisodeStream,
  getEpisodesThumbnails,
  getAiringStatus,
  streamTelegramVideo,
};
