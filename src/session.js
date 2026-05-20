'use strict';

/**
 * session.js — Gestor de sesiones en memoria para el módulo de tests.
 * Válido para un VPS con un solo proceso Node.js.
 */

const sessions = new Map();

const SESSION_TTL = 30 * 60 * 1000; // 30 minutos

function createSession(userId, data) {
  sessions.set(userId, {
    ...data,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL
  });
}

function getSession(userId) {
  const session = sessions.get(userId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

function updateSession(userId, updates) {
  const session = getSession(userId);
  if (!session) return null;
  const updated = { ...session, ...updates, expiresAt: Date.now() + SESSION_TTL };
  sessions.set(userId, updated);
  return updated;
}

function deleteSession(userId) {
  sessions.delete(userId);
}

// Limpieza automática cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (now > session.expiresAt) sessions.delete(userId);
  }
}, 10 * 60 * 1000);

module.exports = { createSession, getSession, updateSession, deleteSession };
