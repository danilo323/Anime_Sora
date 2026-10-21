const express = require('express');
const router = express.Router();

const {
  getVaultAnimes,
  addAnimeToVault,
  removeAnimeFromVault,
} = require('../controllers/vaultController');

const {
  searchAnimeCards,
  getTopAnime,
  getAnimeById,
  getAnimeRecommendations,
  getEpisodeStream,
  getEpisodesThumbnails,
} = require('../controllers/streamController');

// Rutas de Bóveda Privada
router.get('/vault', getVaultAnimes);
router.post('/vault', addAnimeToVault);
router.delete('/vault/:id', removeAnimeFromVault);

// Rutas de Catálogo y Búsqueda (solo consulta al backend)
router.get('/top', getTopAnime);
router.get('/search', searchAnimeCards);
router.get('/anime/:id', getAnimeById);
router.get('/anime/:id/recommendations', getAnimeRecommendations);
router.get('/anime/:id/episodes-thumbnails', getEpisodesThumbnails);

// Endpoint de episodios (migrará a Jellyfin en Fase 3)
router.get('/episode/:slug/:ep', getEpisodeStream);

module.exports = router;
