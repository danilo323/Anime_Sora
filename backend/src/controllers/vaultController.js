const fs = require('fs');
const { VAULT_PATH } = require('../config/constants');

function readVault() {
  try {
    if (!fs.existsSync(VAULT_PATH)) {
      fs.writeFileSync(VAULT_PATH, JSON.stringify([], null, 2));
      return [];
    }
    const raw = fs.readFileSync(VAULT_PATH, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (error) {
    console.error('Error leyendo myVault.json:', error.message);
    return [];
  }
}

function writeVault(data) {
  fs.writeFileSync(VAULT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/vault -> Obtiene únicamente los animes que el usuario escogió
function getVaultAnimes(req, res) {
  const vault = readVault();
  res.json(vault);
}

// POST /api/vault -> Guarda una tarjeta (Japonés o Español Latino) en el servidor
function addAnimeToVault(req, res) {
  const animeCard = req.body;
  if (!animeCard || !animeCard.id || !animeCard.title) {
    return res.status(400).json({ error: 'Datos de la tarjeta incompletos' });
  }

  const vault = readVault();
  const exists = vault.some((item) => String(item.id) === String(animeCard.id));

  if (exists) {
    return res.status(409).json({ message: 'Esta versión del anime ya está en tu colección' });
  }

  const newEntry = {
    ...animeCard,
    addedAt: new Date().toISOString(),
  };

  vault.push(newEntry);
  writeVault(vault);
  res.status(201).json(newEntry);
}

// DELETE /api/vault/:id -> Elimina una tarjeta específica de la colección
function removeAnimeFromVault(req, res) {
  const { id } = req.params;
  const vault = readVault();
  const filtered = vault.filter((item) => String(item.id) !== String(id));

  writeVault(filtered);
  res.json({ ok: true, removedId: id });
}

module.exports = {
  getVaultAnimes,
  addAnimeToVault,
  removeAnimeFromVault,
};
