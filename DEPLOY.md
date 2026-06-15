# Despliegue en Render

## Servicio Web (API + Frontend)

Este proyecto está configurado para desplegarse como un **Web Service** en Render que sirve tanto el frontend compilado como la API.

### Configuración

| Campo | Valor |
|---|---|
| **Runtime** | Node |
| **Build Command** | `bash render-build.sh` |
| **Start Command** | `node backend/dist/index.mjs` |
| **Root Directory** | (raíz del repo) |

### Variables de Entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | URL de conexión PostgreSQL |
| `JWT_SECRET` | ✅ | Secreto para firmar tokens JWT |
| `NODE_ENV` | ✅ | `production` |
| `TMDB_API_KEY` | ❌ | Para scraping de metadatos |
| `YOUTUBE_API_KEY` | ❌ | Para importación de YouTube |

### Base de Datos

Usar **Render PostgreSQL** o cualquier PostgreSQL externa.

1. Crear una base de datos PostgreSQL en Render
2. Copiar la `DATABASE_URL` interna a las variables de entorno del Web Service
3. Las tablas se crean automáticamente al iniciar

### Notas

- El build command ejecuta `render-build.sh`, que:
  1. Instala `yt-dlp` para descargas de video
  2. Instala dependencias con `pnpm install --frozen-lockfile`
  3. Compila el frontend con Vite
  4. Copia el frontend a `backend/public/`
  5. Compila el backend con esbuild
- El frontend compilado se sirve como contenido estático desde el backend
