'use strict';

/**
 * scraper.js — Scraping del portal de Reclutamiento de la Defensa
 * Extrae listados de noticias y detalles completos (título, fecha, resumen, imagen)
 */

const cheerio = require('cheerio');
const { URL }  = require('url');
const logger   = require('./logger');
const { buildHttpClient } = require('./http');

// ---------------------------------------------------------------------------
// Helpers de URL
// ---------------------------------------------------------------------------

/**
 * Convierte una URL relativa en absoluta y elimina parámetros de tracking.
 */
function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    // Eliminar parámetros de tracking
    for (const param of ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'ref']) {
      u.searchParams.delete(param);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * Construye la URL de una página paginada.
 */
function buildPageUrl(baseUrl, page) {
  if (page <= 1) return baseUrl;
  const u = new URL(baseUrl);
  u.searchParams.set('cur', String(page));
  return u.toString();
}

// ---------------------------------------------------------------------------
// Extracción de listado
// ---------------------------------------------------------------------------

/**
 * Extrae items de noticias de una página HTML.
 * @returns {Array<{title: string, url: string}>}
 */
function extractNewsFromPage(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a[href*="/-/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href) return;

    const url = normalizeUrl(href, baseUrl);
    if (!url || seen.has(url)) return;

    // Extraer título desde texto, aria-label o title
    let title = $(el).text().replace(/\s+/g, ' ').trim();
    if (!title) title = $(el).attr('aria-label') || $(el).attr('title') || '';
    title = title.trim();
    if (!title) return;

    seen.add(url);
    items.push({ title, url });
  });

  return items;
}

// ---------------------------------------------------------------------------
// Extracción de detalles
// ---------------------------------------------------------------------------

/**
 * Extrae la URL de imagen principal del artículo.
 */
function extractImageUrl($ , baseUrl) {
  const metaCandidates = [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('meta[property="twitter:image"]').attr('content'),
  ];
  for (const src of metaCandidates) {
    if (src && src.trim()) return normalizeUrl(src.trim(), baseUrl);
  }

  const imgSelectors = [
    'article img[src]', 'main img[src]',
    '.article img[src]', '.news img[src]', 'img[src]',
  ];
  for (const sel of imgSelectors) {
    const src = $(sel).first().attr('src') || '';
    if (src.trim()) return normalizeUrl(src.trim(), baseUrl);
  }

  return null;
}

/**
 * Extrae el resumen del artículo (meta description → primer párrafo → texto plano).
 */
function extractSummary($) {
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  if (metaDesc.trim()) return metaDesc.replace(/\s+/g, ' ').trim();

  for (const sel of ['article', 'main', '[role="main"]']) {
    const container = $(sel).first();
    if (!container.length) continue;
    const paragraphs = [];
    container.find('p').each((_, p) => {
      const text = $(p).text().replace(/\s+/g, ' ').trim();
      if (text) paragraphs.push(text);
    });
    if (paragraphs.length) return paragraphs[0].substring(0, 800);
  }

  return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 800);
}

/**
 * Extrae una fecha en formato humano del texto de la página.
 */
function extractDateFromText(text) {
  const patterns = [
    /\b\d{1,2}\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}\s+\d{4}\b/i,
    /\b\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+\s+de\s+\d{4}\b/i,
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Funciones públicas
// ---------------------------------------------------------------------------

/**
 * Obtiene todas las noticias del portal paginando hasta maxPages.
 * @param {object} httpClient — instancia axios
 * @param {string} baseUrl
 * @param {number} maxPages
 * @returns {Promise<Array<{title,url}>>}
 */
async function fetchAllNews(httpClient, baseUrl, maxPages) {
  const allItems = [];
  const seenUrls = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = buildPageUrl(baseUrl, page);
    logger.info(`Leyendo página ${page}: ${pageUrl}`);

    let html;
    try {
      const resp = await httpClient.get(pageUrl);
      html = resp.data;
    } catch (err) {
      logger.warn(`Error al obtener página ${page}: ${err.message}`);
      break;
    }

    const items = extractNewsFromPage(html, baseUrl);
    if (!items.length) {
      logger.info(`Página ${page} vacía, deteniendo paginación.`);
      break;
    }

    let newCount = 0;
    for (const item of items) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      allItems.push(item);
      newCount++;
    }

    if (newCount === 0) break;
  }

  logger.info(`Total noticias encontradas: ${allItems.length}`);
  return allItems;
}

/**
 * Obtiene los detalles completos de un artículo.
 * @param {object} httpClient
 * @param {{title: string, url: string}} item
 * @returns {Promise<{title,url,date,summary,imageUrl}>}
 */
async function fetchDetail(httpClient, item) {
  const resp = await httpClient.get(item.url);
  const html = resp.data;
  const $ = cheerio.load(html);

  // Título: buscar h1 en varios contextos
  let title = '';
  for (const sel of ['h1', 'article h1', 'main h1', '.portlet-title h1']) {
    const node = $(sel).first();
    if (node.length) {
      title = node.text().replace(/\s+/g, ' ').trim();
      if (title) break;
    }
  }
  if (!title) title = item.title;

  const pageText = $.text ? $.text() : $('body').text();
  const date     = extractDateFromText(pageText);
  const summary  = extractSummary($);
  const imageUrl = extractImageUrl($, item.url);

  return { title, url: item.url, date, summary, imageUrl };
}

module.exports = { fetchAllNews, fetchDetail };
