const {
  searchAnimeMetadata,
  getTopAnimeMetadata,
  getAnimeByIdMetadata,
  getRecommendationsMetadata,
} = require('../services/jikanService');

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
 * Endpoint temporal de episodios (se conectará a Jellyfin en la Fase 3)
 */
async function getEpisodeStream(req, res) {
  const { slug, ep } = req.params;
  res.json({
    slug,
    episode: Number(ep),
    servers: [],
  });
}

module.exports = {
  searchAnimeCards,
  getTopAnime,
  getAnimeById,
  getAnimeRecommendations,
  getEpisodeStream,
};
