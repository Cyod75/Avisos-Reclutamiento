'use strict';

/**
 * messages.js — Construcción de mensajes HTML para Telegram
 */

const { escapeHtml } = require('./telegram');

/**
 * Trunca texto a max caracteres añadiendo "…" si es necesario.
 */
function truncate(text, maxLen) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Mensajes del bot
// ---------------------------------------------------------------------------

function buildHelpText() {
  return (
    '🪖 <b>Bot de Reclutamiento — Defensa</b>\n\n' +
    'Monitorizo el portal oficial de reclutamiento y te aviso cuando hay noticias nuevas.\n\n' +
    '<b>Comandos disponibles:</b>\n' +
    '/start — Bienvenida\n' +
    '/ayuda — Este menú de ayuda\n' +
    '/ultima_noticia — Última noticia con foto y resumen\n' +
    '/ultima_publicacion — Última publicación oficial\n' +
    '/acceder — Enlace directo al portal de reclutamiento\n' +
    '/categorias — Categorías y áreas de reclutamiento\n' +
    '/contacto — Teléfonos y correos de interés\n' +
    '/psicotecnico_web — Enlaces y accesos a tests psicotécnicos\n' +
    '/tests_ia — Practicar tests psicotécnicos y de personalidad con IA\n' +
    '/cancelar_test — Cancela el test activo en ese momento\n' +
    '/estado — Estado interno del bot\n\n' +
    '⏰ El bot comprueba noticias automáticamente cada 3 horas.'
  );
}

function buildWelcomeText() {
  return (
    '👋 <b>¡Hola! Soy el Bot de Reclutamiento de la Defensa.</b>\n\n' +
    'Te avisaré automáticamente cuando haya noticias nuevas en el portal oficial.\n\n' +
    'Usa /ayuda para ver todos los comandos disponibles.'
  );
}

function buildStateText(state, newsCount, intervalMinutes) {
  const lastChecked = state.lastCheckedAt
    ? new Date(state.lastCheckedAt).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary' })
    : 'Nunca';
  const seen = (state.seenUrls || []).length;

  return (
    '📊 <b>Estado del bot</b>\n\n' +
    `🗞 Noticias registradas: <b>${seen}</b>\n` +
    `🔎 Última comprobación: <b>${escapeHtml(lastChecked)}</b>\n` +
    `📄 Noticias encontradas ahora: <b>${newsCount}</b>\n` +
    `⏱ Intervalo de comprobación: <b>cada ${intervalMinutes} minutos</b>\n` +
    `🤖 Estado: <b>✅ Activo</b>`
  );
}

function buildAccessText(portalUrl) {
  return (
    '🔗 <b>Portal de Reclutamiento — Defensa</b>\n\n' +
    'Accede al portal oficial para consultar convocatorias, requisitos y más:\n\n' +
    `<a href="${portalUrl}">${escapeHtml(portalUrl)}</a>`
  );
}

function buildCategoriasText() {
  return (
    '📋 <b>Áreas de Reclutamiento</b>\n\n' +
    '🪖 <b>Ejército de Tierra</b>\n' +
    '   Militares de tropa, especialistas, oficiales y suboficiales\n\n' +
    '✈️ <b>Ejército del Aire y del Espacio</b>\n' +
    '   Tropa y marinería, suboficiales, oficiales\n\n' +
    '⚓ <b>Armada</b>\n' +
    '   Marinería, suboficiales, cuerpo general\n\n' +
    '🛡 <b>Guardia Civil</b>\n' +
    '   Escala de Cabos y Guardias, Escala de Suboficiales\n\n' +
    '🏥 <b>Cuerpos Comunes</b>\n' +
    '   Sanidad Militar, Jurídico Militar, Intervención\n\n' +
    '🔎 Usa /ultima_noticia para ver la última convocatoria.'
  );
}

function buildContactoText() {
  return (
    '📞 <b>Contacto y Teléfonos de Interés</b>\n\n' +
    '☎️ <b>Teléfono:</b> 928 432 666 <i>(Las Palmas)</i>\n' +
    '✉️ <b>Correo:</b> reclutamientolaspalmas@oc.mde.es\n' +
    '☎️ <b>Teléfono:</b> 91 308 97 98 <i>(Reclutamiento)</i>\n' +
    '☎️ <b>Teléfono:</b> 902 432 100 <i>(Otro)</i>'
  );
}

function buildPsicotecnicoText() {
  return (
    '🧠 <b>Tests Psicotécnicos — Tropa y Marinería</b>\n\n' +
    '🔹 <b>OpositaTest:</b>\n' +
    '🔗 <a href="https://www.opositatest.com/oposiciones/tropa-marineria/test">https://www.opositatest.com/oposiciones/tropa-marineria/test</a>\n' +
    '🔗 <a href="https://www.opositatest.com/oposiciones/psicotecnicos-generales/test">https://www.opositatest.com/oposiciones/psicotecnicos-generales/test</a>\n' +
    '✉️ Correo: <code>mepowos950@marineso.com</code>\n' +
    '🔑 Contraseña: <code>perrosanchez123</code>\n\n' +
    '🔹 <b>Opositor:</b>\n' +
    '🔗 <a href="https://www.opositor.com/hacer-test?oposicion=tropa-y-marineria&modulos%5B%5D=4">https://www.opositor.com/hacer-test?oposicion=tropa-y-marineria&modulos%5B%5D=4</a>'
  );
}

/**
 * Caption para una noticia individual (con foto).
 */
function buildNewsCaption(detail, summaryLen = 700) {
  const lines = [`<b>${escapeHtml(detail.title)}</b>`];

  if (detail.date) {
    lines.push(`📅 <i>${escapeHtml(detail.date)}</i>`);
  }

  if (detail.summary) {
    lines.push('');
    lines.push(escapeHtml(truncate(detail.summary, summaryLen)));
  }

  lines.push('');
  lines.push(`🔗 <a href="${escapeHtml(detail.url)}">Leer noticia completa</a>`);

  return lines.join('\n').trim();
}

/**
 * Mensaje para la última publicación.
 */
function buildPublicationText(pub) {
  const lines = ['📄 <b>Última Publicación</b>\n'];
  lines.push(`<b>${escapeHtml(pub.title)}</b>`);

  if (pub.date) {
    lines.push(`📅 <i>${escapeHtml(pub.date)}</i>`);
  }

  if (pub.summary) {
    lines.push('');
    lines.push(escapeHtml(pub.summary));
  }

  lines.push('');
  lines.push(`🔗 <a href="${escapeHtml(pub.url)}">Abrir publicación</a>`);

  return lines.join('\n').trim();
}

/**
 * Digest de múltiples noticias en un único mensaje.
 */
function buildDigestText(items) {
  const lines = ['📰 <b>Nuevas noticias — Reclutamiento Defensa</b>', ''];

  items.forEach((item, idx) => {
    const title = escapeHtml(item.title);
    const url   = escapeHtml(item.url);
    if (item.date) {
      lines.push(`${idx + 1}. ${title} — <i>${escapeHtml(item.date)}</i>\n${url}`);
    } else {
      lines.push(`${idx + 1}. ${title}\n${url}`);
    }
    lines.push('');
  });

  return lines.join('\n').trim();
}

module.exports = {
  buildHelpText,
  buildWelcomeText,
  buildStateText,
  buildAccessText,
  buildCategoriasText,
  buildContactoText,
  buildPsicotecnicoText,
  buildNewsCaption,
  buildDigestText,
  buildPublicationText,
  truncate,
};
