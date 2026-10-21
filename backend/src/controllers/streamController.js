const {
  searchAnimeMetadata,
  getTopAnimeMetadata,
  getAnimeByIdMetadata,
  getRecommendationsMetadata,
  getAnimeEpisodesThumbnails,
} = require('../services/jikanService');
const { getEpisodeServers } = require('../services/scraperService');

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
 * Devuelve la lista de servidores de streaming extraídos de las fuentes en español (Camino 1)
 */
async function getEpisodeStream(req, res) {
  const { slug, ep } = req.params;
  const audioKey = req.query.audioKey || 'SUB';
  try {
    const servers = await getEpisodeServers(slug, ep, audioKey);
    res.json({
      slug,
      episode: Number(ep),
      audioKey,
      servers,
    });
  } catch (error) {
    console.error(`Error en getEpisodeStream para ${slug} ep ${ep}:`, error.message);
    res.status(500).json({ error: 'Error al obtener servidores' });
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
};
