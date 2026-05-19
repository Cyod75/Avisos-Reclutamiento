/**
 * ecosystem.config.js — Configuración de PM2 para el Bot de Reclutamiento Defensa
 *
 * Uso:
 *   pm2 start ecosystem.config.js        # Arrancar
 *   pm2 stop reclutamiento-bot           # Parar
 *   pm2 restart reclutamiento-bot        # Reiniciar
 *   pm2 logs reclutamiento-bot           # Ver logs en tiempo real
 *   pm2 save                             # Guardar lista de procesos
 *   pm2 startup                          # Activar arranque automático con el sistema
 */

module.exports = {
  apps: [
    {
      // ── Identificación ─────────────────────────────────────────────────────
      name: 'reclutamiento-bot',
      script: './src/index.js',

      // ── Entorno ────────────────────────────────────────────────────────────
      cwd: __dirname,
      env_file: '.env',

      // ── Runtime ────────────────────────────────────────────────────────────
      // Modo fork (no cluster): el bot mantiene estado en memoria, un solo proceso es suficiente
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=256',

      // ── Reinicios automáticos ──────────────────────────────────────────────
      // Reiniciar si el proceso cae, pero con backoff exponencial para evitar bucles de crash
      autorestart: true,
      watch: false,                // No reiniciar al cambiar ficheros en producción
      max_memory_restart: '300M',  // Reiniciar si supera 300MB de RAM
      restart_delay: 5000,         // Esperar 5s entre reinicios
      max_restarts: 10,            // Máximo 10 reinicios seguidos antes de dar por fallado
      min_uptime: '30s',           // Se considera estable si lleva 30s corriendo

      // ── Logs ───────────────────────────────────────────────────────────────
      output: './logs/out.log',
      error: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // ── Apagado limpio ─────────────────────────────────────────────────────
      // PM2 enviará SIGTERM y esperará hasta kill_timeout antes de forzar SIGKILL
      kill_timeout: 10000,
      listen_timeout: 5000,

      // ── Variables de entorno ───────────────────────────────────────────────
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'INFO',
      },
      env_development: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'DEBUG',
      },
    },
  ],
};
