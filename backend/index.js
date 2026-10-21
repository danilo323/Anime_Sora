require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PORT } = require('./src/config/constants');
const animeRoutes = require('./src/routes/animeRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Prefijo principal de la API
app.use('/api', animeRoutes);

// Ruta de verificación de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Sora Anime Vault Backend' });
});

app.listen(PORT, () => {
  console.log(`🚀 Sora Anime Backend corriendo en http://localhost:${PORT}`);
});
