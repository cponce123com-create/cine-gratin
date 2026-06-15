# Backend — Cine Gratin

API server Express + TypeScript con PostgreSQL.

## Requisitos

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+

## Variables de entorno

Copiar `.env.example` a `.env`:

```bash
cp backend/.env.example backend/.env
```

## Scripts

```bash
pnpm dev          # Compila TypeScript e inicia el servidor
pnpm build        # Build con esbuild
pnpm start        # Iniciar servidor compilado
pnpm typecheck    # Verificación de tipos
```

## Stack

- **Express 5** como framework web
- **PostgreSQL** + `pg` para base de datos
- **Pino** para logging estructurado
- **Helmet** para seguridad HTTP
- **JWT** para autenticación
- **esbuild** para build rápido
- **TMDB API** para metadatos de películas/series
