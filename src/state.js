'use strict';

/**
 * state.js — Persistencia del estado del bot (noticias vistas, offset, última comprobación)
 * Escritura atómica: escribe en .tmp y luego renombra para evitar corrupción.
 */

const fs   = require('fs');
const path = require('path');
const logger = require('./logger');

const DEFAULT_STATE = () => ({
  seenUrls: [],
  offset: 0,
  lastCheckedAt: null,
});

/**
 * Carga el estado desde disco. Si el fichero no existe o está corrupto, devuelve estado vacío.
 * @param {string} filePath
 * @returns {object}
 */
function loadState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return DEFAULT_STATE();
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) throw new Error('Estado inválido');

    return {
      seenUrls:      Array.isArray(data.seenUrls)    ? data.seenUrls    : [],
      offset:        typeof data.offset === 'number'  ? data.offset      : 0,
      lastCheckedAt: data.lastCheckedAt               ?? null,
    };
  } catch (err) {
    logger.warn('Estado ilegible, se reinicia. Razón:', err.message);
    return DEFAULT_STATE();
  }
}

/**
 * Guarda el estado en disco de forma atómica.
 * @param {string} filePath
 * @param {object} state
 */
function saveState(filePath, state) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

module.exports = { loadState, saveState };
