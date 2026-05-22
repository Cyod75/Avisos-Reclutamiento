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
// CONSTANTES VISUALES
// ─────────────────────────────────────────

const LABELS = ['A', 'B', 'C'];

const DIFICULTADES_PSICOTECNICO = {
  facil: {
    label: 'Fácil',
    descripcion: 'nivel básico, enunciados directos, operaciones sencillas y poco cálculo mental',
    temperatura: 0.75
  },
  medio: {
    label: 'Medio',
    descripcion: 'nivel similar al habitual de práctica para Tropa y Marinería, con razonamiento moderado',
    temperatura: 0.9
  },
  dificil: {
    label: 'Difícil',
    descripcion: 'nivel exigente, más pasos de razonamiento, distractores plausibles y mayor presión de tiempo',
    temperatura: 0.95
  }
};

function normalizarDificultadPsicotecnico(dificultad) {
  return DIFICULTADES_PSICOTECNICO[dificultad] ? dificultad : 'medio';
}

// ─────────────────────────────────────────
// PROMPTS DE GROQ
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

function buildPsicotecnicoUserPrompt(tiposYa = [], dificultad = 'medio') {
  const dificultadKey = normalizarDificultadPsicotecnico(dificultad);
  const dificultadConfig = DIFICULTADES_PSICOTECNICO[dificultadKey];
  const evitar = tiposYa.length > 0 
    ? `Evita estos tipos de aptitud que ya se han usado recientemente: ${tiposYa.join(', ')}.` 
    : '';

  return `Genera un test psicotécnico de exactamente 10 preguntas para oposiciones de Tropa y Marinería del Ejército Español.

Dificultad solicitada: ${dificultadConfig.label}.
Adapta todas las preguntas a esta dificultad: ${dificultadConfig.descripcion}.

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

function buildResultadosPsicotecnicoPrompt(preguntas, respuestasUsuario, dificultad = 'medio') {
  const dificultadConfig = DIFICULTADES_PSICOTECNICO[normalizarDificultadPsicotecnico(dificultad)];
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

  return `El usuario ha completado un test psicotécnico de dificultad ${dificultadConfig.label} y ${preguntas.length} preguntas para las oposiciones de Tropa y Marinería. Ha obtenido ${aciertos}/${preguntas.length} aciertos.

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

function buildProgressBar(current, total) {
  const porcentaje = Math.round((current / total) * 100);
  const filled = Math.floor(porcentaje / 10);
  const barra = '▓'.repeat(filled) + '░'.repeat(10 - filled);
  return `<code>${barra}</code>  ${porcentaje}%`;
}

function formatearOpciones(opciones) {
  return opciones
    .map((opcion, idx) => `<b>${LABELS[idx]}.</b> ${tg.escapeHtml(opcion)}`)
    .join('\n');
}

function construirBotonesOpciones(opciones) {
  const btnOptions = [opciones.map((_, idx) => ({
    text: LABELS[idx],
    callback_data: `tia_r_${idx}`
  }))];
  
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

async function limpiarBotonExplicacionAnterior(chatId, session, messageIdActual) {
  const anterior = session.lastExplanationMessageId;
  if (!anterior || anterior === messageIdActual) return;

  try {
    await tg.editMessageReplyMarkup(config.botToken, chatId, anterior, null, config.timeoutMs);
  } catch (err) {
    logger.warn(`No se pudo quitar el botón de explicación anterior: ${err.message}`);
  }
}

async function mostrarMenuDificultadPsicotecnico(chatId) {
  await tg.sendMessage(config.botToken, chatId, '🧠 <b>Test psicotécnico</b>\n\nElige la dificultad:', {
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🟢 Fácil', callback_data: 'tia_psi_facil' }],
        [{ text: '🟡 Medio', callback_data: 'tia_psi_medio' }],
        [{ text: '🔴 Difícil', callback_data: 'tia_psi_dificil' }],
        [{ text: '❌ Cancelar', callback_data: 'tia_cancel' }]
      ]
    }
  }, config.timeoutMs);
}

// ─────────────────────────────────────────
// FLUJO PSICOTÉCNICO
// ─────────────────────────────────────────

async function iniciarPsicotecnico(chatId, userId, dificultad = 'medio') {
  const dificultadKey = normalizarDificultadPsicotecnico(dificultad);
  const dificultadConfig = DIFICULTADES_PSICOTECNICO[dificultadKey];

  await tg.sendMessage(config.botToken, chatId, `🧠 <b>Generando tu test psicotécnico ${tg.escapeHtml(dificultadConfig.label.toLowerCase())}...</b>\n\nEsto puede tardar unos segundos.`, {}, config.timeoutMs);

  try {
    const rawJson = await llamarGrok(
      PSICOTECNICO_SYSTEM_PROMPT,
      buildPsicotecnicoUserPrompt([], dificultadKey),
      dificultadConfig.temperatura
    );
    const test = parsearJSON(rawJson);

    if (!test.preguntas || test.preguntas.length === 0) {
      throw new Error('Test vacío recibido de Groq');
    }

    createSession(userId, {
      tipo: 'psicotecnico',
      dificultad: dificultadKey,
      preguntas: test.preguntas,
      respuestas: [],
      preguntaActual: 0,
      totalPreguntas: test.preguntas.length,
      lastExplanationMessageId: null,
      lastExplanationQuestionIdx: null
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
  await limpiarBotonExplicacionAnterior(chatId, session, messageId);
  
  // Editar mensaje actual: mostrar resultado + botón explicación
  const progreso = `${preguntaActual + 1}/${totalPreguntas}`;
  const indicador = esCorrecta ? '✅' : '❌';

  const dificultad = DIFICULTADES_PSICOTECNICO[normalizarDificultadPsicotecnico(session.dificultad)]?.label;
  let answerText = `<b>Pregunta ${progreso}</b>  ·  <i>${tg.escapeHtml(pregunta.aptitud.toUpperCase())}</i>  ·  ${tg.escapeHtml(dificultad)}\n${buildProgressBar(preguntaActual + 1, totalPreguntas)}\n\n${tg.escapeHtml(pregunta.enunciado)}\n\n${indicador}  <b>${LABELS[opcionIdx]} ·</b> ${tg.escapeHtml(pregunta.opciones[opcionIdx])}`;

  if (!esCorrecta) {
    answerText += `\n✅  <b>${LABELS[pregunta.correct]} ·</b> ${tg.escapeHtml(pregunta.opciones[pregunta.correct])}`;
  }

  // Botón de explicación (guarda índice de la pregunta respondida)
  const explBtn = { text: '💡 Ver explicación', callback_data: `tia_e_${preguntaActual}` };

  try {
    await tg.editMessageText(config.botToken, chatId, messageId, answerText, {
      replyMarkup: { inline_keyboard: [[explBtn]] }
    }, config.timeoutMs);
  } catch (err) {
    logger.warn(`No se pudo editar el mensaje del test: ${err.message}`);
  }

  const nuevaPreguntaActual = preguntaActual + 1;
  updateSession(userId, {
    respuestas: nuevasRespuestas,
    preguntaActual: nuevaPreguntaActual,
    lastExplanationMessageId: messageId,
    lastExplanationQuestionIdx: preguntaActual
  });

  if (nuevaPreguntaActual >= totalPreguntas) {
    await tg.sleep(600);
    await tg.sendMessage(config.botToken, chatId, '✅ <b>¡Test completado!</b>\nAnalizando tus resultados...', {}, config.timeoutMs);
    await mostrarResultadosPsicotecnico(chatId, userId, preguntas, nuevasRespuestas, session.dificultad);
  } else {
    await tg.sleep(400);
    await enviarPregunta(chatId, userId, null);
  }
}

async function mostrarResultadosPsicotecnico(chatId, userId, preguntas, respuestasUsuario, dificultad = 'medio') {
  try {
    const aciertos = preguntas.filter((p, i) => respuestasUsuario[i] === p.correct).length;
    const nota = Math.round((aciertos / preguntas.length) * 10);
    const emoji = nota >= 7 ? '🏆' : nota >= 5 ? '📈' : '📉';
    const dificultadConfig = DIFICULTADES_PSICOTECNICO[normalizarDificultadPsicotecnico(dificultad)];

    await tg.sendMessage(config.botToken, chatId, `${emoji} <b>Resultado: ${aciertos}/${preguntas.length}</b>  ·  Nota: <b>${nota}/10</b>\nDificultad: <b>${tg.escapeHtml(dificultadConfig.label)}</b>\n\nGenerando informe detallado...`, {}, config.timeoutMs);

    const informeRaw = await llamarGrok(
      'Eres un experto en psicología militar. Genera informes claros, motivadores y útiles para opositores al Ejército Español.',
      buildResultadosPsicotecnicoPrompt(preguntas, respuestasUsuario, dificultad),
      0.6
    );

    const chunks = dividirEnChunks(informeRaw, 4000);
    for (const chunk of chunks) {
      await tg.sendMessage(config.botToken, chatId, chunk, {}, config.timeoutMs);
    }

    await tg.sendMessage(config.botToken, chatId, '¿Quieres hacer otro test?', {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '🧠 Nuevo psicotécnico', callback_data: 'tia_again_psi' },
            { text: '🧬 Test personalidad', callback_data: 'tia_again_per' }
          ]
        ]
      }
    }, config.timeoutMs);

    updateSession(userId, { completado: true });
  } catch (error) {
    logger.error(`[tests_ia] Error generando informe: ${error.message}`);
    await tg.sendMessage(config.botToken, chatId, '⚠️ No se pudo generar el informe detallado, pero tu puntuación fue guardada.', {}, config.timeoutMs);
    updateSession(userId, { completado: true });
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
  
  const answerText = `<b>Pregunta ${progreso}</b>\n${buildProgressBar(preguntaActual + 1, totalPreguntas)}\n\n${tg.escapeHtml(pregunta.enunciado)}\n\n▸ <b>${LABELS[opcionIdx]} ·</b> ${tg.escapeHtml(pregunta.opciones[opcionIdx])}`;
  
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
    await tg.sleep(600);
    await tg.sendMessage(config.botToken, chatId, '✅ <b>¡Has completado el test!</b>\nAnalizando tu perfil de personalidad...', {}, config.timeoutMs);
    await mostrarResultadosPersonalidad(chatId, userId, preguntas, nuevasRespuestas);
  } else {
    await tg.sleep(400);
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
        inline_keyboard: [
          [
            { text: '🧠 Test psicotécnico', callback_data: 'tia_again_psi' },
            { text: '🧬 Otro personalidad', callback_data: 'tia_again_per' }
          ]
        ]
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
    const dificultad = DIFICULTADES_PSICOTECNICO[normalizarDificultadPsicotecnico(session.dificultad)]?.label;
    texto = `<b>Pregunta ${progreso}</b>  ·  <i>${tg.escapeHtml(pregunta.aptitud.toUpperCase())}</i>  ·  ${tg.escapeHtml(dificultad)}\n${buildProgressBar(preguntaActual, totalPreguntas)}\n\n${tg.escapeHtml(pregunta.enunciado)}\n\n${formatearOpciones(pregunta.opciones)}`;
  } else {
    texto = `<b>Pregunta ${progreso}</b>\n${buildProgressBar(preguntaActual, totalPreguntas)}\n\n${tg.escapeHtml(pregunta.enunciado)}\n\n${formatearOpciones(pregunta.opciones)}`;
  }

  const opts = {
    replyMarkup: {
      inline_keyboard: construirBotonesOpciones(pregunta.opciones)
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
// HANDLER: EXPLICACIÓN
// ─────────────────────────────────────────

async function mostrarExplicacion(chatId, userId, messageId, preguntaIdx) {
  const session = getSession(userId);
  if (!session || session.tipo !== 'psicotecnico') return;

  if (
    preguntaIdx !== session.lastExplanationQuestionIdx ||
    messageId !== session.lastExplanationMessageId
  ) {
    try {
      await tg.editMessageReplyMarkup(config.botToken, chatId, messageId, null, config.timeoutMs);
    } catch (err) {
      logger.warn(`No se pudo quitar un botón de explicación obsoleto: ${err.message}`);
    }
    return;
  }

  const pregunta = session.preguntas[preguntaIdx];
  if (!pregunta || !pregunta.explanation) return;

  const progreso = `${preguntaIdx + 1}/${session.totalPreguntas}`;
  const opcionIdx = session.respuestas[preguntaIdx];

  // Si por algún motivo no hay respuesta registrada para esta pregunta, ignorar
  if (opcionIdx === undefined) return;

  const esCorrecta = opcionIdx === pregunta.correct;
  const indicador = esCorrecta ? '✅' : '❌';
  const dificultad = DIFICULTADES_PSICOTECNICO[normalizarDificultadPsicotecnico(session.dificultad)]?.label;

  let answerText = `<b>Pregunta ${progreso}</b>  ·  <i>${tg.escapeHtml(pregunta.aptitud.toUpperCase())}</i>  ·  ${tg.escapeHtml(dificultad)}\n${buildProgressBar(preguntaIdx + 1, session.totalPreguntas)}\n\n${tg.escapeHtml(pregunta.enunciado)}\n\n${indicador}  <b>${LABELS[opcionIdx]} ·</b> ${tg.escapeHtml(pregunta.opciones[opcionIdx])}`;

  if (!esCorrecta) {
    answerText += `\n✅  <b>${LABELS[pregunta.correct]} ·</b> ${tg.escapeHtml(pregunta.opciones[pregunta.correct])}`;
  }

  answerText += `\n\n💡 <i>${tg.escapeHtml(pregunta.explanation)}</i>`;

  try {
    await tg.editMessageText(config.botToken, chatId, messageId, answerText, {}, config.timeoutMs);
  } catch (err) {
    logger.warn(`No se pudo editar explicación: ${err.message}`);
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
        inline_keyboard: [
          [{ text: '🧠  Test Psicotécnico', callback_data: 'tia_menu_psi' }],
          [{ text: '🧬  Test Personalidad', callback_data: 'tia_menu_per' }]
        ]
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
    deleteSession(userId);
    await mostrarMenuDificultadPsicotecnico(chatId);
    return;
  }

  if (callbackData.startsWith('tia_psi_')) {
    const dificultad = callbackData.replace('tia_psi_', '');
    await iniciarPsicotecnico(chatId, userId, dificultad);
    return;
  }

  if (callbackData === 'tia_menu_per' || callbackData === 'tia_again_per') {
    deleteSession(userId);
    await iniciarPersonalidad(chatId, userId);
    return;
  }

  if (callbackData === 'tia_cancel') {
    deleteSession(userId);
    try {
      await tg.editMessageText(config.botToken, chatId, messageId, '❌ Test cancelado.\nUsa /tests_ia para empezar de nuevo.', {}, config.timeoutMs);
    } catch(e) {
      await tg.sendMessage(config.botToken, chatId, '❌ Test cancelado.\nUsa /tests_ia para empezar de nuevo.', {}, config.timeoutMs);
    }
    return;
  }

  // Botón explicación: tia_e_{preguntaIdx}
  if (callbackData.startsWith('tia_e_')) {
    const preguntaIdx = parseInt(callbackData.split('_')[2], 10);
    await mostrarExplicacion(chatId, userId, messageId, preguntaIdx);
    return;
  }

  // Respuesta: tia_r_{opcionIdx}
  if (callbackData.startsWith('tia_r_')) {
    const session = getSession(userId);
    if (!session) {
      await tg.sendMessage(config.botToken, chatId, '⏰ Tu sesión ha expirado o no existe. Usa /tests_ia para empezar.', {}, config.timeoutMs);
      return;
    }

    if (session.completado || session.preguntaActual >= session.totalPreguntas) {
      try {
        await tg.editMessageReplyMarkup(config.botToken, chatId, messageId, null, config.timeoutMs);
      } catch (err) {
        logger.warn(`No se pudo limpiar un botón de respuesta obsoleto: ${err.message}`);
      }
      return;
    }

    const opcionIdx = parseInt(callbackData.split('_')[2], 10);
    if (!Number.isInteger(opcionIdx) || opcionIdx < 0 || opcionIdx >= LABELS.length) return;

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
