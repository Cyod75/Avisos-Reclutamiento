# 🪖 Bot de Reclutamiento — Defensa España

Bot de Telegram que monitoriza el portal [reclutamiento.defensa.gob.es](https://reclutamiento.defensa.gob.es/noticias) y envía noticias nuevas automáticamente. Diseñado para correr 24/7 en un VPS con **Node.js + PM2**.

---

## ✨ Funcionalidades

| Función | Descripción |
|---|---|
| 🔔 Alertas automáticas | Comprueba noticias cada 3 horas (configurable). Solo notifica si hay novedades |
| 📷 Foto + resumen | Cada noticia se envía con imagen, resumen y enlace directo |
| 📋 Digest | Si hay más de N noticias nuevas, envía un resumen agrupado |
| 🤖 Comandos | Responde a comandos en tiempo real (polling cada 5s) |
| 💾 Estado persistente | Guarda el estado en `state.json` para sobrevivir reinicios |
| 🔄 PM2 ready | Apagado limpio con SIGTERM, reinicio automático, logs separados |

---

## 🤖 Comandos disponibles

| Comando | Descripción |
|---|---|
| `/start` | Mensaje de bienvenida |
| `/ayuda` | Lista de comandos disponibles |
| `/ultima_noticia` | Última noticia con foto, resumen y enlace |
| `/acceder` | Enlace directo al portal de reclutamiento |
| `/categorias` | Áreas y ramas de reclutamiento (Tierra, Aire, Armada, GC…) |
| `/contacto` | Teléfonos y correos de interés |
| `/estado` | Estado interno del bot (noticias vistas, última comprobación…) |

---

## 🚀 Instalación en VPS

### 1. Clonar y preparar

```bash
cd /opt
git clone <tu-repo> reclutamiento-bot
cd reclutamiento-bot/Node
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Rellena los valores obligatorios:

```env
TELEGRAM_BOT_TOKEN=123456789:AABBccDDeeFFggHH...
TELEGRAM_CHAT_ID=-100123456789
```

### 4. Crear carpeta de logs

```bash
mkdir -p logs
```

### 5. Arrancar con PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # Para que arranque automáticamente con el sistema
```

---

## ⚙️ Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | *(obligatorio)* | Token de @BotFather |
| `TELEGRAM_CHAT_ID` | *(obligatorio)* | ID del canal/grupo/chat |
| `BASE_URL` | `https://reclutamiento.defensa.gob.es/noticias` | URL del portal |
| `NEWS_CHECK_INTERVAL_MINUTES` | `180` | Intervalo entre comprobaciones (minutos) |
| `TELEGRAM_POLL_INTERVAL_SECONDS` | `5` | Intervalo de polling de comandos (segundos) |
| `MAX_PAGES` | `8` | Páginas máximas a scrapear |
| `MAX_NEW_NOTIFICATIONS` | `5` | Máximo de noticias nuevas a enviar por ciclo |
| `TIMEOUT_MS` | `30000` | Timeout HTTP en ms |
| `COMMAND_MAX_AGE_SECONDS` | `600` | Ignorar comandos más antiguos que N segundos |
| `STATE_FILE` | `state.json` | Ruta del fichero de estado |
| `LOG_LEVEL` | `INFO` | Nivel de log (`DEBUG`, `INFO`, `WARN`, `ERROR`) |

---

## 🛠️ Comandos útiles de PM2

```bash
pm2 logs reclutamiento-bot          # Logs en tiempo real
pm2 status                          # Estado de todos los procesos
pm2 restart reclutamiento-bot       # Reiniciar
pm2 stop reclutamiento-bot          # Parar
pm2 delete reclutamiento-bot        # Eliminar del registro de PM2
pm2 monit                           # Monitor visual de CPU/RAM
```

---

## 📁 Estructura del proyecto

```
Node/
├── src/
│   ├── index.js        # Bucle principal (polling + comprobación de noticias)
│   ├── config.js       # Configuración desde .env
│   ├── commands.js     # Handler de comandos de Telegram
│   ├── scraper.js      # Scraping del portal de reclutamiento
│   ├── telegram.js     # Wrapper API de Telegram
│   ├── messages.js     # Construcción de mensajes HTML
│   ├── state.js        # Persistencia de estado en JSON
│   ├── http.js         # Cliente HTTP con reintentos
│   └── logger.js       # Logger con colores y timestamps
├── ecosystem.config.js # Configuración PM2
├── .env.example        # Plantilla de variables de entorno
├── .gitignore
└── package.json
```
