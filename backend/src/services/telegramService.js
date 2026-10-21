/**
 * Servicio de almacenamiento y streaming persistente vía Telegram MTProto (GramJS).
 * Funciona como disco duro blindado para que los videos nunca se caigan.
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getTelegramEpisode,
  saveTelegramEpisode,
  isArchiving,
  markArchivingStart,
  markArchivingEnd,
} = require('./telegramVaultService');

const API_ID = Number(process.env.TELEGRAM_API_ID) || 0;
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const STRING_SESSION = process.env.TELEGRAM_STRING_SESSION || '';
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '';

let clientInstance = null;
let clientConnecting = null;

function isConfigured() {
  return Boolean(API_ID && API_HASH && (BOT_TOKEN || STRING_SESSION) && CHANNEL_ID);
}

/**
 * Obtiene o inicializa la conexión con Telegram MTProto
 */
async function getTelegramClient() {
  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }
  if (clientConnecting) {
    return clientConnecting;
  }
  if (!isConfigured()) {
    return null;
  }

  clientConnecting = (async () => {
    try {
      const session = new StringSession(STRING_SESSION);
      const client = new TelegramClient(session, API_ID, API_HASH, {
        connectionRetries: 3,
        useWSS: false,
      });

      if (BOT_TOKEN) {
        await client.start({
          botAuthToken: BOT_TOKEN,
        });
      } else {
        await client.connect();
      }

      console.log('🤖 [Telegram MTProto] Conectado exitosamente al canal bóveda.');
      clientInstance = client;
      return client;
    } catch (err) {
      console.warn('⚠️ [Telegram MTProto] Error al conectar con Telegram:', err.message);
      return null;
    } finally {
      clientConnecting = null;
    }
  })();

  return clientConnecting;
}

/**
 * Stream de video de Telegram con soporte para HTTP Range (Seek / Adelantar / Retroceder)
 */
async function streamTelegramFile(messageId, req, res) {
  try {
    const client = await getTelegramClient();
    if (!client) {
      return res.status(503).json({
        error: 'Telegram MTProto no configurado o no disponible en este momento.',
      });
    }

    const mid = Number(messageId);
    const messages = await client.getMessages(CHANNEL_ID, { ids: [mid] });
    const message = messages?.[0];

    if (!message || !message.media || !message.media.document) {
      return res.status(404).json({ error: 'Video no encontrado en el canal de Telegram' });
    }

    const doc = message.media.document;
    const totalSize = Number(doc.size);
    const mimeType = doc.mimeType || 'video/mp4';

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      const stream = client.iterDownload({
        file: doc,
        offset: BigInt(start),
        limit: chunkSize,
        chunkSize: 128 * 1024,
      });

      for await (const chunk of stream) {
        if (res.destroyed) break;
        res.write(chunk);
      }
      res.end();
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });

      const stream = client.iterDownload({
        file: doc,
        chunkSize: 128 * 1024,
      });

      for await (const chunk of stream) {
        if (res.destroyed) break;
        res.write(chunk);
      }
      res.end();
    }
  } catch (err) {
    console.error('Error al transmitir video desde Telegram:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error transmitiendo archivo de Telegram' });
    }
  }
}

/**
 * Tarea asíncrona en segundo plano:
 * Descarga el video (.mp4) de mejor calidad y lo sube al canal de Telegram para preservación eterna.
 */
async function queueAutoArchive({ slug, episode, audioKey = 'SUB', videoUrl }) {
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) return;
  if (!isConfigured()) return; // Si no hay credenciales, omite silenciosamente

  // Verificar si ya existe en la bóveda
  const existing = getTelegramEpisode(slug, episode, audioKey);
  if (existing && existing.telegramMessageId) return;

  // Evitar duplicar descarga concurrente
  if (isArchiving(slug, episode, audioKey)) return;
  markArchivingStart(slug, episode, audioKey);

  // Ejecución en segundo plano sin bloquear el hilo HTTP
  setImmediate(async () => {
    const tempFile = path.join(
      os.tmpdir(),
      `sora_vault_${slug}_ep${episode}_${Date.now()}.mp4`
    );

    try {
      console.log(`📦 [Auto-Archivador] Iniciando descarga para bóveda: ${slug} Ep ${episode}...`);

      const response = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 120000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
      });

      const writer = fs.createWriteStream(tempFile);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const stats = fs.statSync(tempFile);
      if (stats.size < 1024 * 1024) {
        throw new Error('Archivo descargado demasiado pequeño (< 1MB)');
      }

      const client = await getTelegramClient();
      if (!client) throw new Error('Cliente Telegram no disponible');

      console.log(`🚀 [Auto-Archivador] Subiendo ${slug} Ep ${episode} a canal Telegram (${(stats.size / 1024 / 1024).toFixed(1)} MB)...`);

      const caption = `🌸 Sora Anime Bóveda\n🎬 ${slug} — Episodio ${episode} (${audioKey})\n📦 Tamaño: ${(stats.size / 1024 / 1024).toFixed(1)} MB`;

      const result = await client.sendFile(CHANNEL_ID, {
        file: tempFile,
        caption,
        workers: 4,
        supportsStreaming: true,
      });

      if (result && result.id) {
        saveTelegramEpisode(slug, episode, audioKey, {
          telegramMessageId: result.id,
          channelId: CHANNEL_ID,
          fileSize: stats.size,
          fileName: `${slug}-ep${episode}.mp4`,
        });
        console.log(`✅ [Auto-Archivador] Episodio ${episode} de ${slug} guardado para siempre en Telegram (Msg ID: ${result.id}).`);
      }
    } catch (err) {
      console.warn(`⚠️ [Auto-Archivador] No se pudo auto-archivar ${slug} Ep ${episode}:`, err.message);
    } finally {
      markArchivingEnd(slug, episode, audioKey);
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (_) {}
      }
    }
  });
}

module.exports = {
  isConfigured,
  getTelegramClient,
  streamTelegramFile,
  queueAutoArchive,
};
