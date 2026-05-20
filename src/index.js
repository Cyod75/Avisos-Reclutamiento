'use strict';

/**
 * index.js — Punto de entrada principal del Bot de Reclutamiento Defensa
 *
 * Arquitectura:
 *  - Bucle de polling de Telegram cada TELEGRAM_POLL_INTERVAL_SECONDS segundos
 *  - Comprobación periódica de noticias cada NEWS_CHECK_INTERVAL_MINUTES minutos
 *  - Si hay noticias nuevas → las envía automáticamente al chat
 *  - Si no hay novedades → silencio total (sin mensajes innecesarios)
 *  - Manejo robusto de errores con reintentos y backoff
 *
 * Para VPS con PM2:
 *   pm2 start ecosystem.config.js
 */

require('dotenv').config();

const config   = require('./config');
const logger   = require('./logger');
const { loadState, saveState } = require('./state');
const { buildHttpClient }      = require('./http');
const { fetchAllNews }         = require('./scraper');
const tg = require('./telegram');
const { handleCommand, sendNewsDetail, isStaleMessage } = require('./commands');
const { buildDigestText } = require('./messages');
const { handleTestCallback } = require('./tests_ia');

// ---------------------------------------------------------------------------
// Validación de configuración obligatoria
// ---------------------------------------------------------------------------

if (!config.botToken || !config.chatId) {
  logger.error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en el fichero .env');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Estado global del proceso
// ---------------------------------------------------------------------------

const httpClient   = buildHttpClient(config.timeoutMs);
let lastNewsCheck  = 0;          // timestamp en ms de la última comprobación de noticias
let currentNews    = [];         // caché de noticias obtenidas en el último ciclo
let isCheckingNews = false;      // mutex para evitar comprobaciones solapadas
let isRunning      = true;       // flag para apagado limpio

// ---------------------------------------------------------------------------
// Apagado limpio con SIGTERM / SIGINT (requerido por PM2)
// ---------------------------------------------------------------------------

function shutdown(signal) {
  logger.info(`Señal ${signal} recibida. Apagando bot...`);
  isRunning = false;
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Comprobación periódica de noticias
// ---------------------------------------------------------------------------

async function checkForNewNews(state) {
  if (isCheckingNews) return state;
  isCheckingNews = true;

  try {
    logger.info('⏰ Iniciando comprobación periódica de noticias...');
    const news = await fetchAllNews(httpClient, config.baseUrl, config.maxPages);
    currentNews = news;

    if (!news.length) {
      logger.warn('No se encontraron noticias en la comprobación.');
      lastNewsCheck  = Date.now();
      state.lastCheckedAt = new Date().toISOString();
      return state;
    }

    const seenUrls = new Set(state.seenUrls || []);

    // Primera ejecución: sólo guardamos baseline, no enviamos nada
    if (!seenUrls.size) {
      logger.info(`Primera ejecución. Guardando baseline de ${news.length} noticias.`);
      state.seenUrls     = news.map((n) => n.url);
      state.lastCheckedAt = new Date().toISOString();
      lastNewsCheck      = Date.now();
      return state;
    }

    // Detectar noticias nuevas (las que no estaban en seenUrls)
    const newItems = news.filter((n) => !seenUrls.has(n.url));

    if (!newItems.length) {
      logger.info('Sin noticias nuevas. Silencio.');
    } else {
      logger.info(`🆕 ¡${newItems.length} noticia(s) nueva(s) detectada(s)!`);

      // Enviar las primeras N noticias con detalle completo
      const toSend = newItems.slice(0, config.maxNewNotifications);
      for (const item of toSend) {
        try {
          const { fetchDetail } = require('./scraper');
          const detail = await fetchDetail(httpClient, item);
          await sendNewsDetail(detail);
          await tg.sleep(1500); // Pausa anti-flood entre mensajes
        } catch (err) {
          logger.error(`Error enviando noticia "${item.url}": ${err.message}`);
        }
      }

      // Si hay más noticias de las enviadas, enviar un digest resumen
      const remaining = newItems.slice(config.maxNewNotifications);
      if (remaining.length > 0) {
        logger.info(`Enviando digest de ${remaining.length} noticias adicionales.`);
        try {
          await tg.sendMessage(
            config.botToken,
            config.chatId,
            `📋 Hay <b>${remaining.length} noticias más</b>:\n\n` + buildDigestText(remaining),
            {},
            config.timeoutMs,
          );
        } catch (err) {
          logger.error(`Error enviando digest: ${err.message}`);
        }
      }

      // Actualizar seenUrls con todas las noticias vistas
      news.forEach((n) => seenUrls.add(n.url));
      state.seenUrls = [...seenUrls].sort();
    }

    lastNewsCheck      = Date.now();
    state.lastCheckedAt = new Date().toISOString();
    return state;
  } finally {
    isCheckingNews = false;
  }
}

// ---------------------------------------------------------------------------
// Procesamiento de updates de Telegram
// ---------------------------------------------------------------------------

async function processUpdates(state) {
  const offset  = typeof state.offset === 'number' ? state.offset : 0;
  let newOffset = offset;

  let updates;
  try {
    updates = await tg.getUpdates(config.botToken, offset, config.timeoutMs);
  } catch (err) {
    logger.warn(`Error al obtener updates de Telegram: ${err.message}`);
    return state;
  }

  if (!updates.length) return state;

  logger.debug(`Recibidos ${updates.length} update(s) de Telegram.`);

  // Recopilar el último comando válido del chat configurado
  let latestCommand = null;
  let latestCommandUserId = null;

  for (const update of updates) {
    const updateId = Number(update.update_id);
    newOffset = Math.max(newOffset, updateId + 1);

    if (update.callback_query) {
      const cb = update.callback_query;
      const cbChatId = String(cb.message?.chat?.id || '');
      const cbUserId = cb.from?.id;
      
      if (cbChatId === String(config.chatId) && cb.data && cb.data.startsWith('tia_')) {
        try {
          await handleTestCallback(cbChatId, cbUserId, cb.data, cb.id, cb.message?.message_id);
        } catch (err) {
          logger.error(`Error en callback ${cb.data}: ${err.message}`);
        }
      }
      continue;
    }

    const message = update.message || update.edited_message;
    if (!message) continue;

    const msgChatId = String(message?.chat?.id || '');
    if (msgChatId !== String(config.chatId)) continue;

    const text = String(message?.text || '').trim();
    if (!text.startsWith('/')) continue;

    // Normalizar comando: /ayuda@BotName → /ayuda
    const rawCmd  = text.split(/\s+/)[0].split('@')[0].toLowerCase();

    if (isStaleMessage(message, config.commandMaxAgeSeconds)) {
      logger.debug(`Comando obsoleto ignorado: ${rawCmd} (update_id=${updateId})`);
      continue;
    }

    latestCommand = rawCmd;
    latestCommandUserId = message.from?.id;
  }

  // Confirmar updates para no recibirlos de nuevo
  if (newOffset > offset) {
    try {
      await tg.confirmUpdates(config.botToken, newOffset, config.timeoutMs);
    } catch (err) {
      logger.warn(`No se pudieron confirmar updates: ${err.message}`);
    }
    state.offset = newOffset;
  }

  // Si hay comando, puede que necesitemos noticias actualizadas
  if (latestCommand) {
    // Refrescar noticias si llevan más de 5 minutos sin actualizarse
    const staleCacheMs = 5 * 60 * 1000;
    if (!currentNews.length || Date.now() - lastNewsCheck > staleCacheMs) {
      try {
        logger.info('Actualizando caché de noticias para responder al comando...');
        currentNews = await fetchAllNews(httpClient, config.baseUrl, config.maxPages);
      } catch (err) {
        logger.warn(`Error al actualizar noticias para comando: ${err.message}`);
      }
    }

    try {
      await handleCommand(latestCommand, { state, httpClient, currentNews, userId: latestCommandUserId });
    } catch (err) {
      logger.error(`Error procesando comando "${latestCommand}": ${err.message}`);
      try {
        await tg.sendMessage(
          config.botToken, config.chatId,
          '⚠️ Ocurrió un error procesando tu comando. Inténtalo de nuevo.',
          {}, config.timeoutMs,
        );
      } catch (_) { /* silenciar error secundario */ }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------

async function main() {
  logger.info('🤖 Bot de Reclutamiento Defensa arrancando...');
  logger.info(`📡 Portal: ${config.baseUrl}`);
  logger.info(`⏰ Intervalo noticias: ${config.newsCheckIntervalMinutes} minutos`);
  logger.info(`🔄 Polling Telegram: cada ${config.telegramPollIntervalSeconds}s`);

  const statePath = config.stateFile;

  while (isRunning) {
    let state = loadState(statePath);

    try {
      // 1) Procesar comandos de Telegram
      state = await processUpdates(state);

      // 2) Comprobar noticias si toca según el intervalo configurado
      const intervalMs = config.newsCheckIntervalMinutes * 60 * 1000;
      const shouldCheck = Date.now() - lastNewsCheck >= intervalMs;

      if (shouldCheck) {
        state = await checkForNewNews(state);
      }
    } catch (err) {
      logger.error(`Error inesperado en el bucle principal: ${err.message}`);
      if (err.stack) logger.debug(err.stack);
    } finally {
      // Guardar estado siempre, aunque haya errores
      try {
        saveState(statePath, state);
      } catch (err) {
        logger.error(`Error al guardar estado: ${err.message}`);
      }
    }

    // Esperar antes del siguiente ciclo de polling
    if (isRunning) {
      await tg.sleep(config.telegramPollIntervalSeconds * 1000);
    }
  }

  logger.info('Bot detenido correctamente. ¡Hasta pronto!');
  process.exit(0);
}

// Capturar errores no controlados para evitar caídas silenciosas
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection:', String(reason));
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException:', err.message);
});

main();
