'use strict';

/**
 * logger.js — Logger simple con timestamps y niveles de color
 */

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const COLORS = {
  DEBUG: '\x1b[36m',  // cyan
  INFO:  '\x1b[32m',  // green
  WARN:  '\x1b[33m',  // yellow
  ERROR: '\x1b[31m',  // red
  RESET: '\x1b[0m',
};

const MIN_LEVEL = LEVELS[((process.env.LOG_LEVEL || 'INFO').toUpperCase())] ?? LEVELS.INFO;

function log(level, message, ...args) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const ts = new Date().toISOString();
  const color = COLORS[level] || '';
  const reset = COLORS.RESET;

  let formatted = message;
  for (const arg of args) {
    formatted += ' ' + (typeof arg === 'object' ? JSON.stringify(arg) : String(arg));
  }

  const output = `${ts} ${color}[${level}]${reset} ${formatted}`;

  if (level === 'ERROR' || level === 'WARN') {
    console.error(output);
  } else {
    console.log(output);
  }
}

const logger = {
  debug: (msg, ...args) => log('DEBUG', msg, ...args),
  info:  (msg, ...args) => log('INFO',  msg, ...args),
  warn:  (msg, ...args) => log('WARN',  msg, ...args),
  error: (msg, ...args) => log('ERROR', msg, ...args),
};

module.exports = logger;
