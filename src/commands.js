'use strict';

/**
 * commands.js — Procesador de comandos de Telegram
 * Cada comando recibe el contexto completo y devuelve una Promise.
 */

const tg = require('./telegram');
const {
  buildHelpText,
  buildWelcomeText,
  buildStateText,
  buildAccessText,
  buildCategoriasText,
  buildContactoText,
  buildNewsCaption,
} = require('./messages');
const { fetchDetail } = require('./scraper');
const logger = require('./logger');
const config = require('./config');

// ---------------------------------------------------------------------------
// Helper: enviar noticia completa (foto + caption, o texto si no hay imagen)
// ---------------------------------------------------------------------------

async function sendNewsDetail(detail) {
  const caption = buildNewsCaption(detail);

  if (detail.imageUrl) {
    try {
      await tg.sendPhoto(
        config.botToken,
        config.chatId,
        detail.imageUrl,
        caption,
        { buttonText: '📰 Leer noticia completa', buttonUrl: detail.url },
        config.timeoutMs,
      );
      return;
    } catch (err) {
      logger.warn(`No se pudo enviar la foto (${detail.imageUrl}): ${err.message}. Enviando como texto.`);
    }
  }

  // Fallback: texto con enlace inline
  await tg.sendMessage(
    config.botToken,
    config.chatId,
    caption,
    {
      disablePreview: false,
      replyMarkup: {
        inline_keyboard: [[{ text: '🔗 Abrir noticia', url: detail.url }]],
      },
    },
    config.timeoutMs,
  );
}

// ---------------------------------------------------------------------------
// Detector de comandos obsoletos
// ---------------------------------------------------------------------------

function isStaleMessage(message, maxAgeSeconds) {
  if (!maxAgeSeconds || maxAgeSeconds <= 0) return false;
  const rawDate = message?.date;
  if (typeof rawDate !== 'number') return true;
  const ageSeconds = Date.now() / 1000 - rawDate;
  return ageSeconds > maxAgeSeconds;
}

// ---------------------------------------------------------------------------
// Handler principal de comandos
// ---------------------------------------------------------------------------

/**
 * Procesa un comando de Telegram.
 * @param {string}   command          — e.g. "/ayuda"
 * @param {object}   ctx.state        — estado actual del bot
 * @param {object}   ctx.httpClient   — cliente HTTP para el scraper
 * @param {Array}    ctx.currentNews  — lista actual de noticias
 */
async function handleCommand(command, ctx) {
  const { state, httpClient, currentNews } = ctx;
  const token    = config.botToken;
  const chatId   = config.chatId;
  const timeout  = config.timeoutMs;

  logger.info(`Procesando comando: ${command}`);

  // ── /start ────────────────────────────────────────────────────────────────
  if (command === '/start') {
    await tg.sendMessage(token, chatId, buildWelcomeText(), {}, timeout);
    return;
  }

  // ── /ayuda / /help ────────────────────────────────────────────────────────
  if (['/ayuda', '/help'].includes(command)) {
    await tg.sendMessage(token, chatId, buildHelpText(), {}, timeout);
    return;
  }

  // ── /acceder ──────────────────────────────────────────────────────────────
  if (command === '/acceder') {
    await tg.sendMessage(
      token, chatId,
      buildAccessText(config.portalUrl),
      {
        disablePreview: false,
        replyMarkup: {
          inline_keyboard: [[{ text: '🌐 Abrir portal', url: config.portalUrl }]],
        },
      },
      timeout,
    );
    return;
  }

  // ── /categorias ───────────────────────────────────────────────────────────
  if (command === '/categorias') {
    await tg.sendMessage(token, chatId, buildCategoriasText(), {}, timeout);
    return;
  }

  // ── /contacto ─────────────────────────────────────────────────────────────
  if (command === '/contacto') {
    await tg.sendMessage(token, chatId, buildContactoText(), {}, timeout);
    return;
  }

  // ── /estado ───────────────────────────────────────────────────────────────
  if (command === '/estado') {
    const text = buildStateText(state, currentNews.length, config.newsCheckIntervalMinutes);
    await tg.sendMessage(token, chatId, text, {}, timeout);
    return;
  }

  // ── /ultima_noticia / /ultimas_noticias ───────────────────────────────────
  if (['/ultima_noticia', '/ultimas_noticias'].includes(command)) {
    if (!currentNews || !currentNews.length) {
      await tg.sendMessage(token, chatId, '⚠️ No se encontraron noticias en este momento.', {}, timeout);
      return;
    }

    await tg.sendMessage(token, chatId, '🔍 Obteniendo la última noticia...', { disablePreview: true }, timeout);

    const detail = await fetchDetail(httpClient, currentNews[0]);
    await sendNewsDetail(detail);
    return;
  }

  // ── Comando desconocido ───────────────────────────────────────────────────
  await tg.sendMessage(
    token, chatId,
    '❓ Comando no reconocido. Usa /ayuda para ver los comandos disponibles.',
    {},
    timeout,
  );
}

module.exports = { handleCommand, sendNewsDetail, isStaleMessage };
