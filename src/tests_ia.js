'use strict';

/**
 * tests_ia.js — Lógica principal de los tests psicotécnicos y de personalidad
 */

const { createSession, getSession, updateSession, deleteSession } = require('./session');
const { llamarGrok, parsearJSON } = require('./grok');
const tg = require('./telegram');
const config = require('./config');
const logger = require('./logger');

// ─────────────────────────────────────────
// PROMPTS DE GROK
// ─────────────────────────────────────────

const PSICOTECNICO_SYSTEM_PROMPT = `Eres un experto en psicología militar y en el diseño de pruebas psicotécnicas de las Fuerzas Armadas Españolas, específicamente para el acceso a las escalas de Tropa y Marinería. Tu función es generar tests psicotécnicos variados, rigurosos y distintos en cada ejecución.

REGLAS ABSOLUTAS:
- Responde ÚNICAMENTE con un objeto JSON válido. Sin texto adicional, sin markdown, sin explicaciones, sin bloques de código.
- El JSON debe ser parseable directamente con JSON.parse().
- Nunca repitas el mismo test. Varía siempre los tipos de aptitud, los temas y el orden.
- Las preguntas deben ser adecuadas al nivel de las oposiciones de Tropa y Marinería (ESO como base).
- Cada pregunta tiene exactamente 3 opciones de respuesta.
- Solo una opción es correcta.
- El campo "correct" contiene el índice (0, 1 o 2) de la opción correcta.
- El campo "explanation" contiene una explicación breve de por qué esa es la respuesta correcta (máximo 2 frases).`;

function buildPsicotecnicoUserPrompt(tiposYa = []) {
  const evitar = tiposYa.length > 0 
    ? `Evita estos tipos de aptitud que ya se han usado recientemente: ${tiposYa.join(', ')}.` 
    : '';

  return `Genera un test psicotécnico de exactamente 10 preguntas para oposiciones de Tropa y Marinería del Ejército Español.

${evitar}

El test debe incluir una mezcla variada de estos tipos de aptitud (elige los que quieras, pero varía entre tests):
- VERBAL: sinónimos, antónimos, analogías verbales, comprensión lectora breve, completar series de palabras
- NUMÉRICA: operaciones básicas con lógica, series numéricas, problemas de razonamiento numérico
- ESPACIAL: rotaciones mentales (describir con palabras), orientación, figuras y formas
- MECÁNICA: palancas, poleas, engranajes, física básica aplicada
- PERCEPTIVA: diferencias entre series, patrones, detección de elementos distintos
- MEMORIA: recordar datos de un enunciado corto
- RAZONAMIENTO ABSTRACTO: series de letras, patrones lógicos, clasificaciones

Devuelve este JSON exacto:
{
  "tipo": "psicotecnico",
  "aptitudes_incluidas": ["verbal", "numerica"],
  "preguntas": [
    {
      "id": 1,
      "aptitud": "verbal",
      "enunciado": "¿Cuál es el sinónimo de VELOZ?",
      "opciones": ["Lento", "Rápido", "Tranquilo"],
      "correct": 1,
      "explanation": "Veloz significa que se mueve con rapidez. Rápido es su sinónimo directo."
    }
  ]
}`;
}

function buildResultadosPsicotecnicoPrompt(preguntas, respuestasUsuario) {
  const detalles = preguntas.map((p, i) => {
    const respuestaIdx = respuestasUsuario[i];
    const esCorrecta = respuestaIdx === p.correct;
    return {
      pregunta: p.enunciado,
      aptitud: p.aptitud,
      respuesta_usuario: p.opciones[respuestaIdx],
      respuesta_correcta: p.opciones[p.correct],
      correcta: esCorrecta,
      explicacion: p.explanation
    };
  });

  const aciertos = detalles.filter(d => d.correcta).length;

  return `El usuario ha completado un test psicotécnico de ${preguntas.length} preguntas para las oposiciones de Tropa y Marinería. Ha obtenido ${aciertos}/${preguntas.length} aciertos.

Detalle de respuestas:
${JSON.stringify(detalles, null, 2)}

Genera un informe personalizado en español que incluya:
1. Puntuación total y valoración general (una frase motivadora pero honesta)
2. Análisis por aptitud: qué aptitudes domina y cuáles necesita reforzar
3. Para cada pregunta fallada: explica brevemente por qué es correcta la respuesta correcta (usa la "explicacion" del JSON)
4. 3 consejos específicos y prácticos para mejorar en las aptitudes donde ha fallado
5. Frase final de motivación relacionada con el acceso al Ejército

Usa un tono profesional pero cercano. Usa emojis de forma moderada para hacer el texto más legible en Telegram.
ATENCIÓN: Usa ÚNICAMENTE etiquetas HTML válidas de Telegram (<b>, <i>, <u>, <s>, <code>, <pre>). NO uses Markdown ni asteriscos para negritas.`;
}

const PERSONALIDAD_SYSTEM_PROMPT = `Eres un psicólogo militar experto en los procesos de selección de las Fuerzas Armadas Españolas. Conoces en detalle el test de personalidad que se aplica en las oposiciones de Tropa y Marinería: un cuestionario de entre 100 y 133 preguntas donde se evalúan rasgos como estabilidad emocional, disciplina, trabajo en equipo, resiliencia, obediencia, iniciativa y veracidad.

Tu función es generar una versión simulada y educativa de este test, adaptada para práctica en Telegram (versión reducida de 15 preguntas representativas).

REGLAS ABSOLUTAS:
- Responde ÚNICAMENTE con un objeto JSON válido. Sin texto adicional, sin markdown, sin bloques de código.
- Cada pregunta presenta una situación o afirmación y 3 opciones de respuesta que representan distintos perfiles.
- No hay respuestas "correctas" únicas: las opciones representan diferentes rasgos de personalidad.
- Las opciones deben ser realistas y ninguna debe ser obviamente "la correcta" para evitar respuestas falsas.
- Varía las preguntas en cada generación.`;

function buildPersonalidadUserPrompt() {
  return `Genera un test de personalidad simulado de 15 preguntas para practicar el test de acceso a Tropa y Marinería del Ejército Español.

Las preguntas deben evaluar estas dimensiones (incluye al menos 2 preguntas de cada una):
- ESTABILIDAD EMOCIONAL: cómo reacciona ante el estrés, frustración o situaciones de presión
- DISCIPLINA Y NORMAS: actitud ante órdenes, jerarquía y normas establecidas
- TRABAJO EN EQUIPO: cooperación, comunicación, manejo de conflictos
- RESILIENCIA: capacidad de recuperarse ante fracasos o situaciones adversas  
- VERACIDAD: coherencia y honestidad (preguntas de control)
- INICIATIVA Y RESPONSABILIDAD: proactividad y asunción de responsabilidades

Devuelve este JSON exacto:
{
  "tipo": "personalidad",
  "dimension_principal": "resumen de qué evalúa",
  "preguntas": [
    {
      "id": 1,
      "dimension": "estabilidad_emocional",
      "enunciado": "Cuando cometo un error importante en el trabajo...",
      "opciones": [
        "Me afecta mucho y tardo en recuperarme",
        "Lo analizo, aprendo y sigo adelante",
        "Intento que nadie se entere y lo soluciono solo"
      ],
      "rasgos": ["baja_resiliencia", "alta_resiliencia", "baja_comunicacion"]
    }
  ]
}`;
}

function buildAnalisisPersonalidadPrompt(preguntas, respuestasUsuario) {
  const respuestasDetalladas = preguntas.map((p, i) => ({
    dimension: p.dimension,
    enunciado: p.enunciado,
    respuesta_elegida: p.opciones[respuestasUsuario[i]],
    rasgo_asociado: p.rasgos[respuestasUsuario[i]]
  }));

  return `El usuario ha completado un test de personalidad simulado para las oposiciones de Tropa y Marinería del Ejército Español.

Respuestas del usuario:
${JSON.stringify(respuestasDetalladas, null, 2)}

Genera un informe de perfil de personalidad que incluya:

1. PERFIL GENERAL: Una descripción de 3-4 líneas del perfil de personalidad del usuario basada en sus respuestas.
2. PUNTOS FUERTES: 3 rasgos positivos detectados con ejemplos de qué preguntas los revelan.
3. ÁREAS DE MEJORA: 2-3 aspectos que podría trabajar para ajustarse mejor al perfil militar, explicando por qué esos rasgos son valorados en el Ejército.
4. ANÁLISIS POR DIMENSIÓN: Para cada dimensión evaluada, una línea de valoración.
5. CONSEJO SOBRE EL TEST REAL: Explica brevemente qué busca el Ejército en este test y cómo afrontar las preguntas de veracidad/coherencia sin "actuar".
6. ADVERTENCIA IMPORTANTE: Recuerda al usuario que este es un test de práctica simulado, no el test oficial, y que en el test real deben responder con total sinceridad porque el sistema detecta inconsistencias.

Usa tono profesional y constructivo. 
ATENCIÓN: Usa ÚNICAMENTE etiquetas HTML válidas de Telegram (<b>, <i>, <u>, <s>, <code>, <pre>). NO uses Markdown ni asteriscos para negritas. Usa saltos de línea y emojis moderados para legibilidad.`;
}

// ─────────────────────────────────────────
// UTILIDADES DE MENSAJES Y BOTONES
// ─────────────────────────────────────────

function construirBotonesOpciones(opciones, preguntaId) {
  const btnOptions = opciones.map((opcion, idx) => ([{
    text: `${['🅰️','🅱️','🅲️'][idx]} ${opcion}`,
    callback_data: `tia_r_${idx}` // 'r' de respuesta
  }]));
  
  btnOptions.push([{ text: '❌ Cancelar test', callback_data: 'tia_cancel' }]);
  return btnOptions;
}

function dividirEnChunks(texto, maxLen) {
  if (texto.length <= maxLen) return [texto];
  
  const chunks = [];
  let inicio = 0;
  
  while (inicio < texto.length) {
    let fin = inicio + maxLen;
    if (fin < texto.length) {
      const ultimoSalto = texto.lastIndexOf('\n', fin);
      if (ultimoSalto > inicio) fin = ultimoSalto;
    }
    chunks.push(texto.slice(inicio, fin).trim());
    inicio = fin;
  }
  
  return chunks;
}

// ─────────────────────────────────────────
// FLUJO PSICOTÉCNICO
// ─────────────────────────────────────────

async function iniciarPsicotecnico(chatId, userId) {
  await tg.sendMessage(config.botToken, chatId, '🧠 <b>Generando tu test psicotécnico personalizado...</b>\n\nEsto puede tardar unos segundos.', {}, config.timeoutMs);

  try {
    const rawJson = await llamarGrok(PSICOTECNICO_SYSTEM_PROMPT, buildPsicotecnicoUserPrompt());
    const test = parsearJSON(rawJson);

    if (!test.preguntas || test.preguntas.length === 0) {
      throw new Error('Test vacío recibido de Grok');
    }

    createSession(userId, {
      tipo: 'psicotecnico',
      preguntas: test.preguntas,
      respuestas: [],
      preguntaActual: 0,
      totalPreguntas: test.preguntas.length
    });

    await enviarPregunta(chatId, userId, null);

  } catch (error) {
    logger.error(`[tests_ia] Error generando psicotécnico: ${error.message}`);
    await tg.sendMessage(config.botToken, chatId, '❌ Ha ocurrido un error generando el test. Por favor, inténtalo de nuevo con /tests_ia', {}, config.timeoutMs);
    deleteSession(userId);
  }
}

async function procesarRespuestaPsicotecnico(chatId, userId, messageId, opcionIdx, session) {
  const { preguntas, respuestas, preguntaActual, totalPreguntas } = session;
  const pregunta = preguntas[preguntaActual];

  const nuevasRespuestas = [...respuestas, opcionIdx];
  const esCorrecta = opcionIdx === pregunta.correct;
  
  // Editar mensaje actual para quitar botones y mostrar qué respondió
  const progreso = `${preguntaActual + 1}/${totalPreguntas}`;
  const answerText = `📊 <b>Pregunta ${progreso}</b> — <i>${tg.escapeHtml(pregunta.aptitud.toUpperCase())}</i>\n\n${tg.escapeHtml(pregunta.enunciado)}\n\nTu respuesta: <b>${['🅰️','🅱️','🅲️'][opcionIdx]} ${tg.escapeHtml(pregunta.opciones[opcionIdx])}</b> ${esCorrecta ? '✅' : '❌'}`;
  
  try {
    await tg.editMessageText(config.botToken, chatId, messageId, answerText, {}, config.timeoutMs);
  } catch (err) {
    logger.warn(`No se pudo editar el mensaje del test: ${err.message}`);
  }

  const nuevaPreguntaActual = preguntaActual + 1;
  updateSession(userId, {
    respuestas: nuevasRespuestas,
    preguntaActual: nuevaPreguntaActual
  });

  if (nuevaPreguntaActual >= totalPreguntas) {
    await tg.sendMessage(config.botToken, chatId, '✅ <b>¡Test completado!</b> Analizando tus resultados...', {}, config.timeoutMs);
    await mostrarResultadosPsicotecnico(chatId, userId, preguntas, nuevasRespuestas);
  } else {
    await enviarPregunta(chatId, userId, null);
  }
}

async function mostrarResultadosPsicotecnico(chatId, userId, preguntas, respuestasUsuario) {
  try {
    const aciertos = preguntas.filter((p, i) => respuestasUsuario[i] === p.correct).length;
    await tg.sendMessage(config.botToken, chatId, `🎯 <b>Resultado: ${aciertos}/${preguntas.length} aciertos</b>\n\nGenerando informe detallado...`, {}, config.timeoutMs);

    const informeRaw = await llamarGrok(
      'Eres un experto en psicología militar. Genera informes claros, motivadores y útiles para opositores al Ejército Español.',
      buildResultadosPsicotecnicoPrompt(preguntas, respuestasUsuario),
      0.6
    );

    const chunks = dividirEnChunks(informeRaw, 4000);
    for (const chunk of chunks) {
      await tg.sendMessage(config.botToken, chatId, chunk, {}, config.timeoutMs);
    }

    await tg.sendMessage(config.botToken, chatId, '¿Quieres hacer otro test?', {
      replyMarkup: {
        inline_keyboard: [[
          { text: '🔁 Nuevo psicotécnico', callback_data: 'tia_again_psi' },
          { text: '🧬 Test personalidad', callback_data: 'tia_again_per' }
        ]]
      }
    }, config.timeoutMs);

    deleteSession(userId);
  } catch (error) {
    logger.error(`[tests_ia] Error generando informe: ${error.message}`);
    await tg.sendMessage(config.botToken, chatId, '⚠️ No se pudo generar el informe detallado, pero tu puntuación fue guardada.', {}, config.timeoutMs);
    deleteSession(userId);
  }
}

// ─────────────────────────────────────────
// FLUJO PERSONALIDAD
// ─────────────────────────────────────────

async function iniciarPersonalidad(chatId, userId) {
  await tg.sendMessage(config.botToken, chatId, '🧬 <b>Preparando tu test de personalidad...</b>\n\nRecuerda: responde con sinceridad. No hay respuestas correctas o incorrectas, el test evalúa tu perfil de personalidad.', {}, config.timeoutMs);

  try {
    const rawJson = await llamarGrok(PERSONALIDAD_SYSTEM_PROMPT, buildPersonalidadUserPrompt(), 0.85);
    const test = parsearJSON(rawJson);

    createSession(userId, {
      tipo: 'personalidad',
      preguntas: test.preguntas,
      respuestas: [],
      preguntaActual: 0,
      totalPreguntas: test.preguntas.length
    });

    await enviarPregunta(chatId, userId, null);
  } catch (error) {
    logger.error(`[tests_ia] Error generando test personalidad: ${error.message}`);
    await tg.sendMessage(config.botToken, chatId, '❌ Ha ocurrido un error. Inténtalo de nuevo con /tests_ia', {}, config.timeoutMs);
    deleteSession(userId);
  }
}

async function procesarRespuestaPersonalidad(chatId, userId, messageId, opcionIdx, session) {
  const { preguntas, respuestas, preguntaActual, totalPreguntas } = session;
  const pregunta = preguntas[preguntaActual];

  const nuevasRespuestas = [...respuestas, opcionIdx];
  const progreso = `${preguntaActual + 1}/${totalPreguntas}`;
  
  const answerText = `🧬 <b>Pregunta ${progreso}</b>\n\n${tg.escapeHtml(pregunta.enunciado)}\n\nTu respuesta: <b>${['🅰️','🅱️','🅲️'][opcionIdx]} ${tg.escapeHtml(pregunta.opciones[opcionIdx])}</b> ✅`;
  
  try {
    await tg.editMessageText(config.botToken, chatId, messageId, answerText, {}, config.timeoutMs);
  } catch (err) {
    logger.warn(`No se pudo editar el mensaje del test: ${err.message}`);
  }

  const nuevaPreguntaActual = preguntaActual + 1;
  updateSession(userId, {
    respuestas: nuevasRespuestas,
    preguntaActual: nuevaPreguntaActual
  });

  if (nuevaPreguntaActual >= totalPreguntas) {
    await tg.sendMessage(config.botToken, chatId, '✅ <b>¡Has completado el test!</b> Analizando tu perfil de personalidad...', {}, config.timeoutMs);
    await mostrarResultadosPersonalidad(chatId, userId, preguntas, nuevasRespuestas);
  } else {
    await enviarPregunta(chatId, userId, null);
  }
}

async function mostrarResultadosPersonalidad(chatId, userId, preguntas, respuestasUsuario) {
  try {
    const informeRaw = await llamarGrok(
      'Eres un psicólogo militar experto en procesos de selección del Ejército Español. Genera informes de perfil de personalidad útiles, honestos y constructivos.',
      buildAnalisisPersonalidadPrompt(preguntas, respuestasUsuario),
      0.6
    );

    const chunks = dividirEnChunks(informeRaw, 4000);
    for (const chunk of chunks) {
      await tg.sendMessage(config.botToken, chatId, chunk, {}, config.timeoutMs);
    }

    await tg.sendMessage(config.botToken, chatId, '¿Quieres continuar practicando?', {
      replyMarkup: {
        inline_keyboard: [[
          { text: '🧠 Test psicotécnico', callback_data: 'tia_again_psi' },
          { text: '🔁 Otro test personalidad', callback_data: 'tia_again_per' }
        ]]
      }
    }, config.timeoutMs);

    deleteSession(userId);
  } catch (error) {
    logger.error(`[tests_ia] Error en informe personalidad: ${error.message}`);
    await tg.sendMessage(config.botToken, chatId, '⚠️ Hubo un error generando tu informe. Inténtalo de nuevo.', {}, config.timeoutMs);
    deleteSession(userId);
  }
}

// ─────────────────────────────────────────
// FUNCIÓN COMÚN (Pregunta de sesión)
// ─────────────────────────────────────────

async function enviarPregunta(chatId, userId, messageIdParaEditar) {
  const session = getSession(userId);
  if (!session) {
    await tg.sendMessage(config.botToken, chatId, '⏰ Tu sesión ha expirado. Vuelve a iniciar con /tests_ia', {}, config.timeoutMs);
    return;
  }

  const { preguntas, preguntaActual, totalPreguntas, tipo } = session;
  const pregunta = preguntas[preguntaActual];
  const progreso = `${preguntaActual + 1}/${totalPreguntas}`;

  let texto = '';
  if (tipo === 'psicotecnico') {
    texto = `📊 <b>Pregunta ${progreso}</b> — <i>${tg.escapeHtml(pregunta.aptitud.toUpperCase())}</i>\n\n${tg.escapeHtml(pregunta.enunciado)}`;
  } else {
    const porcentaje = Math.round((preguntaActual / totalPreguntas) * 100);
    const completado = Math.floor(porcentaje / 10);
    const barra = '▓'.repeat(completado) + '░'.repeat(10 - completado);
    texto = `🧬 <b>Pregunta ${progreso}</b>\n<code>${barra} ${porcentaje}%</code>\n\n${tg.escapeHtml(pregunta.enunciado)}`;
  }

  const opts = {
    replyMarkup: {
      inline_keyboard: construirBotonesOpciones(pregunta.opciones, pregunta.id)
    }
  };

  if (messageIdParaEditar) {
    try {
      await tg.editMessageText(config.botToken, chatId, messageIdParaEditar, texto, opts, config.timeoutMs);
    } catch (e) {
      await tg.sendMessage(config.botToken, chatId, texto, opts, config.timeoutMs);
    }
  } else {
    await tg.sendMessage(config.botToken, chatId, texto, opts, config.timeoutMs);
  }
}

// ─────────────────────────────────────────
// ENTRADAS (HANDLERS)
// ─────────────────────────────────────────

async function handleTestsIACommand(chatId, userId) {
  deleteSession(userId);
  
  await tg.sendMessage(
    config.botToken, 
    chatId, 
    '🪖 <b>Tests IA — Preparación Ejército</b>\n\nSelecciona el tipo de test que quieres realizar:', 
    {
      replyMarkup: {
        inline_keyboard: [[
          { text: '🧠 Test Psicotécnico', callback_data: 'tia_menu_psi' },
          { text: '🧬 Test Personalidad', callback_data: 'tia_menu_per' }
        ]]
      }
    }, 
    config.timeoutMs
  );
}

async function handleTestCallback(chatId, userId, callbackData, callbackQueryId, messageId) {
  // Siempre respondemos para quitar el spinner
  try {
    await tg.answerCallbackQuery(config.botToken, callbackQueryId, '', config.timeoutMs);
  } catch(e) {}

  if (callbackData === 'tia_menu_psi' || callbackData === 'tia_again_psi') {
    await iniciarPsicotecnico(chatId, userId);
    return;
  }

  if (callbackData === 'tia_menu_per' || callbackData === 'tia_again_per') {
    await iniciarPersonalidad(chatId, userId);
    return;
  }

  if (callbackData === 'tia_cancel') {
    deleteSession(userId);
    try {
      await tg.editMessageText(config.botToken, chatId, messageId, '❌ Test cancelado. Usa /tests_ia para empezar de nuevo.', {}, config.timeoutMs);
    } catch(e) {
      await tg.sendMessage(config.botToken, chatId, '❌ Test cancelado. Usa /tests_ia para empezar de nuevo.', {}, config.timeoutMs);
    }
    return;
  }

  if (callbackData.startsWith('tia_r_')) {
    const session = getSession(userId);
    if (!session) {
      await tg.sendMessage(config.botToken, chatId, '⏰ Tu sesión ha expirado o no existe. Usa /tests_ia para empezar.', {}, config.timeoutMs);
      return;
    }

    const opcionIdx = parseInt(callbackData.split('_')[2], 10);

    if (session.tipo === 'psicotecnico') {
      await procesarRespuestaPsicotecnico(chatId, userId, messageId, opcionIdx, session);
    } else if (session.tipo === 'personalidad') {
      await procesarRespuestaPersonalidad(chatId, userId, messageId, opcionIdx, session);
    }
  }
}

module.exports = {
  handleTestsIACommand,
  handleTestCallback,
  deleteSession
};
