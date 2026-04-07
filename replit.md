# Cine Gratín Workspace

## Overview

pnpm workspace monorepo using TypeScript. **Cine Gratín** is a premium dark-themed Spanish-language movie and TV series streaming platform deployed on Render.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Production Frontend**: React + Vite + Tailwind (`frontend/` — `cine-gratin-frontend`)
- **API framework**: Express 5 (`artifacts/api-server/`)
- **Database**: PostgreSQL (raw pg pool, no ORM)
- **Build**: esbuild (api-server), vite (frontend)
- **State management**: @tanstack/react-query v5
- **SEO**: react-helmet-async

## Artifacts

### Production Cine Gratín Frontend (`frontend/`)
- **Package**: `cine-gratin-frontend`
- **Deployed to**: `https://cine-gratin.onrender.com`
- **Theme**: Dark cinematic, brand-red (#dc2626), brand-gold (#d4af37)
- **Public Pages**:
  - `/` — Home: hero banner, popular carousels, genre/platform filter chips
  - `/peliculas` — Movie catalog with search + genre filter
  - `/series` — Series catalog with search + genre filter
  - `/pelicula/:id` — Movie detail (React Query, Helmet SEO, trailer)
  - `/serie/:id` — Series detail (React Query, Helmet SEO, season/episode selector)
  - `/search/:query` — Unified search page (movies + series tabs)
  - `/player/movie/:imdbId` — Movie player (5 servers, view tracking, 12s timeout overlay)
  - `/player/series/:imdbId` — Series player (5 servers, view tracking, prev/next, 12s timeout)
- **Admin Panel** (`/admin/login`, default: admin / admin123):
  - Token-based auth via API (stores `cg_admin_token` in localStorage)
  - Protected by `ADMIN_SECRET` env var on backend
  - Dashboard, Import by IDs, VidSrc verification

### API Server (`artifacts/api-server`)
- **Port**: 8080 (local), deployed on Render
- **Auth**: POST `/api/auth/login` → returns `{ ok, token }` (token = ADMIN_SECRET)
- **Admin middleware**: Checks `Authorization: Bearer <ADMIN_SECRET>` on all `/admin/*` routes
- **Routes**: `/api/movies`, `/api/movies/search`, `/api/movies/:id/view`, `/api/series`, `/api/series/search`, `/api/series/:id/view`, `/api/admin/*`, `/api/auth/login`, `/api/health`
- **DB Tables**: `movies`, `cv_series`, `cv_auth`, `cv_settings`, `cv_servers`

### Local Preview (`artifacts/cine-gratin/`)
- **Package**: `@workspace/cine-gratin`
- **Purpose**: Simplified local Replit preview (not the production app)
- **Served at**: `/cine-gratin/` via Replit proxy

## Environment Variables

### Frontend (Render)
- `VITE_API_URL` — API base URL (defaults to `https://cine-gratin.onrender.com`)

### Backend (Render + api-server)
- `ADMIN_SECRET` — Random secret string for admin auth (if unset, auth is skipped)
- `DATABASE_URL` — PostgreSQL connection string

## Video Players (Production Frontend)

- 5 servers: vidsrc.net, vidsrc.pro, vidsrc.xyz, 2embed.cc, vidsrc.mov
- Active server highlighted red; inactive servers muted
- 12-second timeout overlay: shows "probar siguiente servidor" button
- View tracking on mount (increments `views` counter in DB via PATCH)

## Navbar Search (Production Frontend)

- Live autocomplete dropdown with 300ms debounce
- Shows poster thumbnails, title, year, content type
- Max 6 movie + 4 series results in dropdown
- "Ver todos los resultados" → `/search/:query`
- Full search page at `/search/:query` with tabs: Todas / Películas / Series

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API server (port 8080)
- `pnpm --filter @workspace/cine-gratin run dev` — run local Replit preview
- `cd frontend && pnpm build` — build production frontend
- `cd artifacts/api-server && pnpm build` — build API server
