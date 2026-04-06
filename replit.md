# Cine Gratín Workspace

## Overview

pnpm workspace monorepo using TypeScript. **Cine Gratín** is a premium dark-themed Spanish-language movie and TV series streaming site with a full admin panel.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React + Vite (CineVault/Cine Gratín)
- **API framework**: Express 5 (api-server)
- **Database**: PostgreSQL (raw pg pool, no ORM)
- **Build**: esbuild (api-server)

## Artifacts

### API Server (`artifacts/api-server`)
- **Port**: 8080
- **Routes**: `/api/movies`, `/api/movies/trending`, `/api/movies/search`, `/api/movies/by-slug/:slug`, `/api/series`, `/api/series/trending`, `/api/series/search`, `/api/settings`, `/api/servers`, `/api/auth`, `/api/tmdb/*`, `/api/health`
- **DB Tables**: `movies`, `cv_settings`, `cv_servers`, `cv_auth`, `cv_series`

### Cine Gratín (`artifacts/cinevault`)
- **Type**: react-vite, served at `/`
- **Purpose**: Premium movie and TV series streaming site in Spanish
- **Theme**: Ultra-dark cinematic (#0a0a0f bg, #00d4ff cyan accent), Bebas Neue headings, DM Sans body
- **Public Pages**:
  - `/` — Home with auto-rotating hero carousel, trending section, "¿Qué veo hoy?" random picker
  - `/browse` — Full catalog with filters (year, genre, rating, sort)
  - `/series` — TV series catalog (DB-backed) + TVMaze search + integrated player
  - `/series/:id` — Dedicated series detail page with season/episode selector and player
  - `/movie/:id` — Movie detail with embedded video player, fullscreen support
  - `/search/:query` — Unified search (movies + series) with tabs
  - `/favorites` — Favorites list (localStorage)
- **Admin Panel** (`/admin`, password: `admin123`):
  - Dashboard with real stats (movies + series counts, views, top content)
  - Add/Edit Movie (TMDB import by IMDb ID)
  - Bulk Import (sequential or list mode, movies + series)
  - Manage Movies (with filters, sortable columns, bulk delete)
  - Add/Edit Series (TMDB import for TV series)
  - Manage Series (with search, bulk delete, featured toggle)
  - Video Servers (movie + TV server management)
  - Settings

## Video Player
- Movies: `{IMDB_ID}` placeholder in server URL patterns
- TV Series: `{IMDB_ID}`, `{SEASON}`, `{EPISODE}` placeholders
- Default movie servers: VidSrc Pro, VidSrc.to, VidSrc.xyz, 2Embed, EmbedSu
- Default TV servers: VidSrc Pro, VidSrc.to, VidSrc.xyz, 2Embed
- Fullscreen modal with ESC support, server switcher overlay
- Auto-next episode with countdown overlay
- Progress saved to localStorage per series

## Navbar Search
- Live autocomplete dropdown showing movies + series as user types
- Shows poster thumbnails, year, season count for quick preview
- "Ver todos los resultados" links to full search page
- Supports Enter key to go directly to search results page

## "¿Qué veo hoy?" Feature
- Random content picker button visible after hero section
- Modal shows poster, title, year, rating, synopsis of random pick
- "Ver Ahora" navigates directly to movie or series detail page
- Re-shuffle button picks another random item

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/cinevault run dev` — run frontend
