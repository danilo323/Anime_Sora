const fs = require('fs');
const path = require('path');

const VAULT_FILE = path.join(__dirname, '../data/telegramVault.json');

// Asegurar que el archivo existe
function initVaultFile() {
  try {
    const dir = path.dirname(VAULT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(VAULT_FILE)) {
      fs.writeFileSync(VAULT_FILE, JSON.stringify({ records: {} }, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Error inicializando telegramVault.json:', err.message);
  }
}

initVaultFile();

function readVault() {
  try {
    if (!fs.existsSync(VAULT_FILE)) {
      initVaultFile();
    }
    const raw = fs.readFileSync(VAULT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Error leyendo telegramVault.json:', err.message);
    return { records: {} };
  }
}

function writeVault(data) {
  try {
    fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando en telegramVault.json:', err.message);
  }
}

function makeKey(slug, episode, audioKey = 'SUB') {
  const s = String(slug || '').toLowerCase().trim();
  const ep = Number(episode) || 1;
  const a = String(audioKey || 'SUB').toUpperCase();
  return `${s}:${ep}:${a}`;
}

// Conjunto para evitar múltiples descargas simultáneas del mismo episodio
const activeTasks = new Set();

function isArchiving(slug, episode, audioKey = 'SUB') {
  return activeTasks.has(makeKey(slug, episode, audioKey));
}

function markArchivingStart(slug, episode, audioKey = 'SUB') {
  activeTasks.add(makeKey(slug, episode, audioKey));
}

function markArchivingEnd(slug, episode, audioKey = 'SUB') {
  activeTasks.delete(makeKey(slug, episode, audioKey));
}

function getTelegramEpisode(slug, episode, audioKey = 'SUB') {
  const vault = readVault();
  const key = makeKey(slug, episode, audioKey);
  return vault.records?.[key] || null;
}

function saveTelegramEpisode(slug, episode, audioKey = 'SUB', recordData = {}) {
  const vault = readVault();
  if (!vault.records) vault.records = {};
  const key = makeKey(slug, episode, audioKey);

  vault.records[key] = {
    slug,
    episode: Number(episode),
    audioKey: String(audioKey).toUpperCase(),
    telegramMessageId: recordData.telegramMessageId,
    channelId: recordData.channelId,
    fileSize: recordData.fileSize || 0,
    fileName: recordData.fileName || `${slug}-ep${episode}.mp4`,
    mimeType: recordData.mimeType || 'video/mp4',
    savedAt: new Date().toISOString(),
  };

  writeVault(vault);
  return vault.records[key];
}

module.exports = {
  getTelegramEpisode,
  saveTelegramEpisode,
  isArchiving,
  markArchivingStart,
  markArchivingEnd,
};
