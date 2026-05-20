'use strict';

/**
 * grok.js — Cliente HTTP para interactuar con la API de Grok
 */

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Llama a la API de Grok con los prompts proporcionados.
 */
async function llamarGrok(systemPrompt, userPrompt, temperature = 0.9) {
  if (!config.grokApiKey) {
    throw new Error('La API Key de Grok no está configurada.');
  }

  try {
    const response = await axios.post(
      GROK_API_URL,
      {
        model: config.grokModel,
        temperature,
        max_tokens: 3500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.grokApiKey}`
        },
        timeout: config.grokTimeoutMs
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    logger.error(`Error en llamarGrok: ${error.message}`);
    if (error.response) {
      logger.error(`Grok API Error Response: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Error en la llamada a Grok: ${error.message}`);
  }
}

/**
 * Limpia el output de Grok para asegurar que es un JSON parseable (quita backticks).
 */
function parsearJSON(raw) {
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(clean);
}

module.exports = { llamarGrok, parsearJSON };
