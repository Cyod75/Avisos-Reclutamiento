'use strict';

/**
 * http.js — Cliente HTTP con reintentos automáticos y headers de navegador
 */

const axios      = require('axios');
const axiosRetry = require('axios-retry').default;

/**
 * Crea un cliente axios con reintentos exponenciales para errores de red y 5xx.
 * @param {number} timeoutMs
 * @returns {import('axios').AxiosInstance}
 */
function buildHttpClient(timeoutMs = 30000) {
  const client = axios.create({
    timeout: timeoutMs,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/125.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  axiosRetry(client, {
    retries: 5,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) => {
      return (
        axiosRetry.isNetworkError(err) ||
        axiosRetry.isRetryableError(err) ||
        [429, 500, 502, 503, 504].includes(err?.response?.status)
      );
    },
    onRetry: (retryCount, err) => {
      const logger = require('./logger');
      logger.warn(`Reintento ${retryCount} por: ${err.message}`);
    },
  });

  return client;
}

module.exports = { buildHttpClient };
