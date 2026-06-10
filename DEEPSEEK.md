# DEEPSEEK.md — Project Knowledge

## Architecture

## Fetch Layer Consolidation

All HTTP API calls now flow through `lib/api.ts`:

- `apiFetch` → public GET requests
- `apiPost` → public POST requests
- `apiPatch` → public PATCH requests
- `adminFetch` → authenticated requests (GET, POST, PUT, DELETE)
- `adminPost` → authenticated POST
- `adminDelete` → authenticated DELETE
- `authHeaders()` → generates Bearer token headers

`hooks/useApi.ts` imports `apiFetch` from `lib/api.ts` instead of redefining it.
`lib/events-api.ts` and `lib/sports-api.ts` import `adminFetch`/`apiFetch` from `lib/api.ts`.

`lib/auth.ts` reads `import.meta.env.VITE_API_URL` directly (no import from api.ts) to avoid circular dependency (api.ts imports getToken from auth.ts).

## Build & CI

- GitHub Actions CI: `.github/workflows/ci.yml` — runs on push/PR to main
  - Prettier check, TypeScript typecheck (root + frontend), build
  - Uses `--frozen-lockfile` for reproducible installs
- `render-build.sh` updated with `--frozen-lockfile`, `pushd`/`popd`, `set -euo pipefail`
- Prettier configured: `.prettierrc` + `.prettierignore`
- `package.json` scripts: `format`, `format:check`

## Consolidation

## Admin YouTube Channel Manager

`components/admin/YouTubeSettingsSection.tsx` — shared API key settings component for YouTube channel-based admin pages. Accepts `getSettings` and `saveSettings` props.

`components/admin/YouTubeChannelsSection.tsx` — shared CRUD component for managing YouTube channels. Handles add/delete/sync/sync-all with two visual variants:

- `variant="list"` — simple card list layout (used by events)
- `variant="table"` — table layout with columns (used by sports)

Accepts config strings for labels/placeholders and all channel API functions as props.

`pages/admin/EventChannels.tsx` reduced from 474→137 lines (-71%), `SportChannels.tsx` from 542→183 lines (-66%). Both are now thin wrappers that compose the shared sections.

All icons (SyncIcon, PlusIcon, KeyIcon, TrashIcon, RefreshIcon, DownloadIcon, WifiIcon) are centralized in `components/admin/icons.tsx`.

## Channels (Events/Sports) API

`lib/channels-api.ts` provides a factory `createChannelApi(channelPrefix, itemEndpoint)` that generates all CRUD functions for YouTube channel-based features (events, sports).

`lib/events-api.ts` and `lib/sports-api.ts` are now thin wrappers (15 lines each) that call `createChannelApi("events", "events")` and `createChannelApi("sports", "sports/matches")` respectively. All existing imports continue to work.

## Shared Components

`components/YouTubeEventGrid.tsx` — generic YouTube video grid with search, embed player, skeleton loading. Used by both Events.tsx and Sports.tsx pages via props (title, heading, queryKey, fetchFn, emptyMessage, errorMessage). Both pages are now ~9 lines each.

## App Routing

`App.tsx` uses `AdminPage` helper component wrapping ProtectedRoute + ErrorBoundary + Suspense, reducing admin route boilerplate from 9×8 lines to 9×1 line. `Suspended` helper used for public layout. Lazy loading via `React.lazy()` was already in place for all routes.

## Auth System

## Auth System

- Login at `POST /api/auth/login` in `artifacts/api-server/src/routes/movies.ts`
- Credentials stored in `cv_auth` table (single row with `id='admin'`)
- Tables: `id`, `password`, `username` (added via migration)
- Login validates both `username` and `password`
- On success returns `ADMIN_SECRET` env var as Bearer token (token stored in `cg_admin_token` localStorage)
- Admin middleware in `artifacts/api-server/src/middlewares/adminAuth.ts` protects all `/admin/*` routes
- Dev mode: if `ADMIN_SECRET` is unset, auth is skipped
- Superadmin: `cponce123.com@gmail.com` / `Hadrones456%`
- Migration script: `scripts/set-superadmin.sql`

## Saga System

## Saga System

- Two saga management pages: `ManageSagas.tsx` (OLD - dead code, not imported) and `SagaManager.tsx` (NEW - active at `/admin/sagas`)
- `SagaManager.tsx` has 4 tabs: Sagas configuradas, Explorar TMDB, Sincronizar BD, Configuración
- Config tab allows drag-to-reorder which updates `sort_order` via `PUT /api/admin/saga-config/:id`
- Backend orders by `sort_order ASC, created_at ASC` for both public and admin endpoints
- Home.tsx displays sagas from `/api/saga-config` (public, active only) + `/api/admin/dynamic-sagas` (auto-detected collections with ≥2 items)
- Hardcoded `SAGA_SECTIONS` in `homeConfig.ts` is a fallback — no longer used by Home.tsx saga rendering
- To reorder: Admin → Gestión de Sagas → Configuración → drag & drop
- If ordering doesn't persist: verify `sort_order` values in `cv_saga_config` table

## Saga System (Eliminado)

El sistema completo de sagas/colecciones fue eliminado el 6/May/2026.

Backend:

- Se eliminaron 18 endpoints de sagas de admin.ts y el endpoint GET /api/sagas de movies.ts
- Se eliminaron las tablas cv_active_sagas y cv_saga_config de db.ts (seed incluido)
- Se eliminaron columnas collection_id/collection_name de INSERTs y queries
- Las columnas collection_id/collection_name en movies y cv_series se conservan en DB (ALTER TABLE ADD COLUMN) para uso futuro

Frontend:

- Archivos eliminados: SagaPage, SagaCard, SagaManager, ManageSagas, SagaExplorer
- App.tsx: rutas /saga/:id y /admin/sagas eliminadas
- Home.tsx: sección de sagas eliminada
- api.ts: todas las funciones de sagas eliminadas (17 funciones)
- homeConfig.ts: SAGA_SECTIONS y SagaSection eliminados
- types.ts: DynamicSaga, SagaConfigRow, collection_id/collection_name de Movie/Series eliminados
- AdminLayout, EditMediaModal, Import: referencias a sagas eliminadas

Regla de importación: las películas deben tener runtime >= 30 minutos para ser importadas (en importMovie de auto-import.ts). No aplica a series.

## Auditoría y Correcciones

## Correcciones de Seguridad (2026-05-06)

- `.gitignore`: agregado `.env`, `.env.local`, `.env.*.local` para prevenir filtrado de secretos
- `db.ts`: eliminada contraseña hardcodeada `admin123` del schema cv_auth
- `set-superadmin.sql`: convertido a usar variables psql (`:'username'`, `:'password'`) en vez de credenciales hardcodeadas
- `movies.ts`: login ya no fallbackea a `admin123` — si no hay fila en cv_auth, devuelve error
- `events.ts` / `sports.ts`: agregada función `requireAuth()` inline a todos los endpoints POST/DELETE (settings, channels, sync, delete). El GET settings aún es público (expone YouTube API key — pendiente de encriptación)

## Correcciones de Estabilidad (2026-05-06)

- `app.ts`: corregido wildcard Express 5 de `*splat` a `(.*)` para SPA catch-all
- `SeriesDetail.tsx`: corregidas props de SeasonData (`season_number` → `season`, `poster_url` → `poster`, `episode_count` → `episodes`)
- `Import.tsx`: eliminado bug runtime donde se hacía spread (`[...n]`) de números (movies_imported/series_imported son number, no array)
- `VidsrcScanner.tsx`: reemplazado `fetch('/api/admin/...')` relativo por `fetchVidsrcRange()` de `api.ts` (usa BASE_URL + auth headers)
- `vite.config.ts` raíz: eliminado `allowedHosts: true`, reemplazado `import.meta.dirname` por `fileURLToPath` compatible con Node 18+
- `api.ts`: agregada función `fetchVidsrcRange()` y tipo `VidsrcRangeResponse`

## Sagas System

## Sagas System

- Added 2026-05-07: Sagas are TMDB movie collections shown on the home page and via /saga/:id detail page.
- Backend: `artifacts/api-server/src/routes/sagas.ts` — two endpoints:
  - `GET /api/sagas` — returns curated list of 15 well-known TMDB collections (Marvel, Harry Potter, Fast & Furious, etc.) sorted by part_count descending. Uses `tmdbFetch` from tmdb-client.
  - `GET /api/sagas/:id` — returns full collection detail with all parts sorted chronologically.
  - Registered in `routes/index.ts` as `router.use(sagasRouter)`.
- Frontend API: `frontend/src/lib/api.ts` — `fetchSagas()`, `fetchSagaById()`, types `SagaItem`, `SagaPart`, `SagaDetail`.
- Home section: `frontend/src/components/home/SagasSection.tsx` — horizontal scrollable row of saga cards (poster, name, film count badge). Shows after TmdbTrailersSection.
- Detail page: `frontend/src/pages/SagaDetail.tsx` — backdrop hero, poster, overview, responsive grid of movie cards linking to themoviedb.org.
- Route: `/saga/:id` registered in `App.tsx` inside PublicLayout before catch-all.

## Vidsrc Scanner

## Vidsrc Scanner

The scanner lives at `/admin/vidsrc-scanner` (`VidsrcScanner.tsx`) and uses **SSE streaming** for real-time progress.

**Backend endpoint**: `GET /api/admin/vidsrc-scan-stream` (in `admin.ts`)

- Downloads ALL vidsrc.me pages in parallel (10 concurrent, no artificial delay)
- Cross-references IMDb IDs against the local DB
- Updates `vidsrc_status` in both `movies` and `cv_series` tables
- Streams events: `start`, `phase`, `page_progress`, `match_progress`, `saving`, `done`, `error`

**Legacy code preserved** (backward compatibility):

- `GET /api/admin/vidsrc-range` — sequential page download (old approach)
- `GET /api/admin/vidsrc-list` — single page fetch
- `saveVidsrcResults` + `verifyVidsrc` — used by `ManageMovies`/`ManageSeries` for per-selection verification

**Frontend details** (`VidsrcScanner.tsx`):

- Uses `EventSource` with `?token=` query param for auth
- Three progress phases: downloading (0-55%) → matching (55-95%) → saving (95-100%)
- After `done` event, reloads catalog from API to populate per-item `vidsrc_status`
- Dashboard card (`VidsrcVerificationCard.tsx`) links to the full scanner page

## Layout & UX

- Carousel scroll containers have `scroll-padding-left` (1rem/1.5rem/2rem responsive) so the first item doesn't snap flush to the left edge
- `<ScrollRestoration />` from react-router-dom is used in App.tsx to restore scroll position on browser back/forward navigation
- Home.tsx content wrapper uses `mx-auto max-w-7xl` to constrain layout proportionally on large screens

## Saga System — Admin Endpoints

`AdminSagas.tsx` calls two backend endpoints:

1. `POST /api/admin/sagas/:id/refresh` — refreshes saga from TMDB, optionally auto-imports missing movies (existed in admin.ts)
2. `POST /api/admin/import-by-tmdb-ids` — imports movies/series directly by TMDB IDs (added 2026-05-07 via `importMovie`/`importSeries` from auto-import.ts)
   Both are in `artifacts/api-server/src/routes/admin.ts`.

## Saga System — Bug Fix

## Saga Movies Showing "No disponible"

### Root Cause

Movies imported via `importByImdbId` (IMDB-based importer) were stored without a `tmdb_id` (NULL). The saga detail endpoint's `findLocalMoviesByTmdbIds` only searched by `tmdb_id`, so it never found these movies — they existed in the DB but were invisible to saga lookup.

### Fix (2026-05-07)

**File 1: `artifacts/api-server/src/jobs/auto-import.ts`**

- `importMovie()` ON CONFLICT clause expanded to also backfill `poster_url` and `background_url` (in addition to existing `cast_full` and `tmdb_id`):
  - `poster_url = COALESCE(NULLIF(movies.poster_url, ''), EXCLUDED.poster_url)`
  - `background_url = COALESCE(NULLIF(movies.background_url, ''), EXCLUDED.background_url)`

**File 2: `artifacts/api-server/src/routes/sagas.ts`**

- `findLocalMoviesByTmdbIds` replaced with two-step lookup:
  1. Direct `tmdb_id` match in `movies` table
  2. For unmatched IDs: fetch `imdb_id` from TMDB `/movie/{id}/external_ids`, then query `movies` by `id = auto_{imdb_id}` as fallback
- Added `POST /api/admin/sagas/backfill-tmdb-ids` — one-time endpoint that queries TMDB `/find/{imdb_id}` for movies with NULL `tmdb_id` and retroactively populates it. Run once after deploy.

## Repo Cleanup

2026-05-07: Remoção massiva de código morto.

Arquivos/diretórios removidos:

- `src/` — Blink skeleton app inteiro (não usado, o real é frontend/)
- `index.html`, `vite.config.ts`, `postcss.config.cjs`, `tailwind.config.cjs` raiz — configs do Blink app
- `lib/db/` — pacote drizzle com schema vazio, não importado por nada
- `lib/api-client-react/` — generated React Query hooks, não importado
- `lib/api-spec/` — OpenAPI spec + orval config, não usado
- `attached_assets/` — pastas de prompts antigos do Replit
- `public/` raiz — SPA redirects duplicados (frontend/public é o real)
- `scripts/src/hello.ts` — hello world inútil
- `tsconfig.node.json` — referenciava vite.config.ts deletado
- `frontend/src/components/GenreCarousel.tsx,text:` — arquivo corrompido (1 byte)

Configs atualizadas:

- `pnpm-workspace.yaml`: remove `lib/integrations/*` (inexistente)
- `tsconfig.json`: remove referências a lib/db e lib/api-client-react
- `.replit`: remove mockup-sandbox artifact, atualiza workflow frontend para `cd frontend && pnpm run dev` (porta 5173)
- `scripts/post-merge.sh`: remove `pnpm --filter db push` (lib/db deletado)
- `scripts/package.json`: remove script hello
- `.gitignore`: adiciona `.deepseek/logs/`

Os únicos artifacts restantes são `api-server` (backend Express) e nenhum mockup-sandbox ou cinevault antigo.
