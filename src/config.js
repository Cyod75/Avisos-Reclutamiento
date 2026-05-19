'use strict';

/**
 * config.js — Carga y valida la configuración desde variables de entorno (.env)
 */

require('dotenv').config();

function envInt(name, defaultVal) {
  const raw = (process.env[name] || '').trim();
  if (!raw) return defaultVal;
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : defaultVal;
}

function envStr(name, defaultVal = '') {
  return (process.env[name] || defaultVal).trim();
}

const config = {
  // Telegram
  botToken: envStr('TELEGRAM_BOT_TOKEN'),
  chatId: envStr('TELEGRAM_CHAT_ID'),

  // Web scraping
  baseUrl: envStr('BASE_URL', 'https://reclutamiento.defensa.gob.es/noticias'),
  portalUrl: 'https://reclutamiento.defensa.gob.es/inicio',
  maxPages: envInt('MAX_PAGES', 8),
  timeoutMs: envInt('TIMEOUT_MS', 30000),
  maxNewNotifications: envInt('MAX_NEW_NOTIFICATIONS', 5),

  // Timing
  newsCheckIntervalMinutes: envInt('NEWS_CHECK_INTERVAL_MINUTES', 180),
  telegramPollIntervalSeconds: envInt('TELEGRAM_POLL_INTERVAL_SECONDS', 5),
  commandMaxAgeSeconds: envInt('COMMAND_MAX_AGE_SECONDS', 600),

  // Persistencia
  stateFile: envStr('STATE_FILE', 'state.json'),
};

module.exports = config;
