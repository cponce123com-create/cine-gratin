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
