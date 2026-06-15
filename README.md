# Cine Gratin 🎬

Plataforma de streaming self-hosted con catálogo de películas, series, deportes y TV en vivo.

## Estructura del proyecto

```
cine-gratin/
├── frontend/          # App React + TypeScript + Vite + Tailwind
├── backend/           # API server Express + TypeScript
├── scripts/           # Utilidades y migraciones
└── .github/           # CI/CD y templates
```

## Requisitos

- **Node.js** 20+
- **pnpm** 9+
- **PostgreSQL** 16+

## Desarrollo

```bash
# Instalar dependencias (desde la raíz)
pnpm install

# Iniciar backend (compila y ejecuta)
pnpm dev:backend

# Iniciar frontend (hot-reload)
pnpm dev:frontend
```

## Build

```bash
# Build completo (frontend + backend)
pnpm render:build

# Build individual
pnpm build:frontend
pnpm build:backend
```

## Despliegue

El proyecto está preparado para desplegarse en **Render**. Ver [`DEPLOY.md`](./DEPLOY.md) para instrucciones detalladas.

## Características

- 🎥 Catálogo de películas y series con datos de TMDB
- 📺 TV en vivo con canales IPTV
- ⚽ Deportes y eventos en vivo
- 🔍 Búsqueda y filtros por género
- 👤 Panel de administración
- 📥 Importación desde YouTube
- 📱 Diseño responsive
