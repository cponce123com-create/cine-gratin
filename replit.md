# CineVault Workspace

## Overview

pnpm workspace monorepo using TypeScript. CineVault is a premium dark-themed Spanish-language movie and TV series streaming site with a full admin panel.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React + Vite (CineVault)
- **API framework**: Express 5 (api-server)
- **Database**: PostgreSQL (raw pg pool, no ORM)
- **Build**: esbuild (api-server)

## Artifacts

### API Server (`artifacts/api-server`)
- **Port**: 8080
- **Routes**: `/api/movies`, `/api/series`, `/api/settings`, `/api/servers`, `/api/auth`, `/api/tmdb/*`, `/api/health`
- **DB Tables**: `movies`, `cv_settings`, `cv_servers`, `cv_auth`, `cv_series`

### CineVault (`artifacts/cinevault`)
- **Type**: react-vite, served at `/`
- **Purpose**: Premium movie and TV series streaming site in Spanish
- **Theme**: Ultra-dark cinematic (#0a0a0f bg, #00d4ff cyan accent), Bebas Neue headings, DM Sans body
- **Public Pages**:
  - `/` — Home with auto-rotating hero carousel, featured movies
  - `/browse` — Full catalog with filters (year, genre, rating, sort)
  - `/series` — TV series catalog (DB-backed) + TVMaze search + integrated player
  - `/movie/:id` — Movie detail with embedded video player, fullscreen support
  - `/search` — Search page
  - `/favorites` — Favorites list (localStorage)
- **Admin Panel** (`/admin`, password: `admin123`):
  - Dashboard with stats
  - Add/Edit Movie (TMDB import by IMDb ID)
  - Bulk Import (sequential or list mode)
  - Manage Movies (with filters, sortable columns, bulk delete)
  - Add/Edit Series (TMDB import for TV series)
  - Manage Series (with search, bulk delete, featured toggle)
  - Video Servers (movie + TV server management)
  - Settings

## Video Player
- Movies: `{IMDB_ID}` placeholder in server URL patterns
- TV Series: `{IMDB_ID}`, `{SEASON}`, `{EPISODE}` placeholders
- Default servers: VidSrc, MultiEmbed, 2Embed, EmbedSu
- Fullscreen modal with ESC support, server switcher overlay

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/cinevault run dev` — run frontend
