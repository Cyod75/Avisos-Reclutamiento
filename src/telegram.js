'use strict';

/**
 * telegram.js — Wrapper sobre la API HTTP de Telegram (sin dependencias de SDK)
 * Soporta: sendMessage, sendPhoto, getUpdates, answerCallbackQuery
 */

const axios  = require('axios');
const logger = require('./logger');

const TG_BASE = 'https://api.telegram.org/bot';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function apiUrl(token, method) {
  return `${TG_BASE}${token}/${method}`;
}

/**
 * Llama a un método de la API de Telegram con reintentos básicos en caso de flood.
 */
async function callApi(token, method, params = {}, timeoutMs = 30000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.post(apiUrl(token, method), params, {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json' },
      });

      const data = resp.data;
      if (!data.ok) {
        throw new Error(`Telegram API error [${method}]: ${JSON.stringify(data)}`);
      }
      return data.result;
    } catch (err) {
      const retryAfter = err?.response?.data?.parameters?.retry_after;
      if (retryAfter && attempt < 3) {
        logger.warn(`Rate limited por Telegram. Esperando ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw err;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Escaping HTML
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Métodos públicos
// ---------------------------------------------------------------------------

/**
 * Envía un mensaje de texto (HTML parse_mode).
 */
async function sendMessage(token, chatId, text, { disablePreview = false, replyMarkup = null } = {}, timeoutMs = 30000) {
  const params = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: disablePreview,
  };
  if (replyMarkup) params.reply_markup = replyMarkup;

  return callApi(token, 'sendMessage', params, timeoutMs);
}

/**
 * Envía una foto con caption y botón inline opcional.
 */
async function sendPhoto(token, chatId, photoUrl, caption, { buttonText = null, buttonUrl = null } = {}, timeoutMs = 30000) {
  const params = {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption.substring(0, 1024),
    parse_mode: 'HTML',
  };

  if (buttonUrl) {
    params.reply_markup = {
      inline_keyboard: [[{ text: buttonText || '📰 Abrir noticia', url: buttonUrl }]],
    };
  }

  return callApi(token, 'sendPhoto', params, timeoutMs);
}

/**
 * Obtiene actualizaciones pendientes (long-poll timeout=0 para polling no bloqueante).
 */
async function getUpdates(token, offset = 0, timeoutMs = 30000) {
  const params = {
    timeout: 0,
    offset,
    limit: 100,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
  };
  const result = await callApi(token, 'getUpdates', params, timeoutMs);
  return Array.isArray(result) ? result : [];
}

/**
 * Confirma los updates hasta offset (para no volver a recibirlos).
 */
async function confirmUpdates(token, offset, timeoutMs = 30000) {
  await callApi(token, 'getUpdates', { offset, limit: 1, timeout: 0 }, timeoutMs);
}

/**
 * Responde a un callback_query (botones inline) para quitar el spinner.
 */
async function answerCallbackQuery(token, callbackQueryId, text = '', timeoutMs = 30000) {
  return callApi(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text }, timeoutMs);
}

/**
 * Edita el texto de un mensaje existente.
 */
async function editMessageText(token, chatId, messageId, text, { disablePreview = false, replyMarkup = null } = {}, timeoutMs = 30000) {
  const params = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: disablePreview,
  };
  if (replyMarkup) params.reply_markup = replyMarkup;

  return callApi(token, 'editMessageText', params, timeoutMs);
}

/**
 * Edita o elimina los botones inline de un mensaje existente.
 */
async function editMessageReplyMarkup(token, chatId, messageId, replyMarkup = null, timeoutMs = 30000) {
  const params = {
    chat_id: chatId,
    message_id: messageId,
  };
  if (replyMarkup) params.reply_markup = replyMarkup;

  return callApi(token, 'editMessageReplyMarkup', params, timeoutMs);
}

module.exports = { sendMessage, sendPhoto, getUpdates, confirmUpdates, answerCallbackQuery, editMessageText, editMessageReplyMarkup, escapeHtml, sleep };
