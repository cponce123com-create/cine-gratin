/**
 * Versioned, idempotent database migrations.
 *
 * Design
 * ------
 * - Every migration has a numeric version and is applied at most once.
 * - Applied versions are recorded in `schema_migrations`.
 * - A PostgreSQL advisory lock serialises the run, so several instances
 *   booting at the same time (Render, CI, cron workers) cannot apply the same
 *   migration twice or block each other for long.
 * - Each migration runs inside its own transaction: a failure rolls back that
 *   migration only, leaving the schema at the last consistent version.
 * - Migrations are additive. Nothing here drops or rewrites existing data.
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
  /**
   * Optional migrations never abort the boot: they are attempted and, when the
   * database refuses them (missing extension privileges, for example), a
   * warning is logged and the migration is retried on the next start.
   */
  optional?: boolean;
}

const CURATED_COLLECTION_IDS = [
  1771, 1241, 9485, 119, 10, 415, 645, 87359, 2344, 8960, 239, 1022790, 539, 111451, 557, 263, 121938, 412,
  131292, 1570, 78, 153, 300, 8091, 1579, 1223848, 916, 180, 8945, 84852,
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "core_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS movies (
        id TEXT PRIMARY KEY,
        imdb_id TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER NOT NULL DEFAULT 0,
        rating NUMERIC NOT NULL DEFAULT 0,
        runtime INTEGER NOT NULL DEFAULT 0,
        genres TEXT[] NOT NULL DEFAULT '{}',
        language TEXT NOT NULL DEFAULT 'es',
        synopsis TEXT NOT NULL DEFAULT '',
        director TEXT NOT NULL DEFAULT '',
        cast_list TEXT[] NOT NULL DEFAULT '{}',
        poster_url TEXT NOT NULL DEFAULT '',
        background_url TEXT NOT NULL DEFAULT '',
        yt_trailer_code TEXT NOT NULL DEFAULT '',
        mpa_rating TEXT NOT NULL DEFAULT 'NR',
        slug TEXT NOT NULL DEFAULT '',
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        video_sources JSONB NOT NULL DEFAULT '[]',
        torrents JSONB NOT NULL DEFAULT '[]',
        views INTEGER NOT NULL DEFAULT 0,
        date_added TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cv_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS cv_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS cv_auth (
        id TEXT PRIMARY KEY DEFAULT 'admin',
        password TEXT NOT NULL DEFAULT ''
      );

      ALTER TABLE cv_auth ADD COLUMN IF NOT EXISTS username TEXT DEFAULT 'admin';

      CREATE TABLE IF NOT EXISTS cv_series (
        id TEXT PRIMARY KEY,
        imdb_id TEXT NOT NULL,
        tmdb_id INTEGER,
        title TEXT NOT NULL,
        year INTEGER NOT NULL DEFAULT 0,
        end_year INTEGER,
        rating NUMERIC NOT NULL DEFAULT 0,
        genres TEXT[] NOT NULL DEFAULT '{}',
        language TEXT NOT NULL DEFAULT 'en',
        synopsis TEXT NOT NULL DEFAULT '',
        creators TEXT[] NOT NULL DEFAULT '{}',
        cast_list TEXT[] NOT NULL DEFAULT '{}',
        poster_url TEXT NOT NULL DEFAULT '',
        background_url TEXT NOT NULL DEFAULT '',
        yt_trailer_code TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        total_seasons INTEGER NOT NULL DEFAULT 1,
        seasons_data JSONB NOT NULL DEFAULT '[]',
        video_sources JSONB NOT NULL DEFAULT '[]',
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        views INTEGER NOT NULL DEFAULT 0,
        date_added TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE movies ADD COLUMN IF NOT EXISTS vidsrc_status TEXT DEFAULT 'unknown';
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS auto_imported BOOLEAN DEFAULT FALSE;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS networks TEXT[] DEFAULT '{}';
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]';
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS reviews JSONB DEFAULT '[]';
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_id INTEGER;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_name TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS cast_full JSONB DEFAULT '[]';
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS vidsrc_status TEXT DEFAULT 'unknown';
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS auto_imported BOOLEAN DEFAULT FALSE;
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS networks TEXT[] DEFAULT '{}';
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]';
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS reviews JSONB DEFAULT '[]';
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS collection_id INTEGER;
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS collection_name TEXT;
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS cast_full JSONB DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS cv_auto_import_log (
        id SERIAL PRIMARY KEY,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        movies_imported INTEGER NOT NULL DEFAULT 0,
        series_imported INTEGER NOT NULL DEFAULT 0,
        total_checked INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT
      );

      INSERT INTO cv_settings (key, value) VALUES ('auto_import_enabled', 'true')
        ON CONFLICT (key) DO NOTHING;

      CREATE INDEX IF NOT EXISTS idx_movies_year_date ON movies (year DESC, date_added DESC);
      CREATE INDEX IF NOT EXISTS idx_movies_views ON movies (views DESC);
      CREATE INDEX IF NOT EXISTS idx_movies_featured ON movies (featured) WHERE featured = TRUE;
      CREATE INDEX IF NOT EXISTS idx_movies_imdb_id ON movies (imdb_id);
      CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies (slug);
      CREATE INDEX IF NOT EXISTS idx_movies_vidsrc ON movies (vidsrc_status);
      CREATE INDEX IF NOT EXISTS idx_series_year_date ON cv_series (year DESC, date_added DESC);
      CREATE INDEX IF NOT EXISTS idx_series_views ON cv_series (views DESC);
      CREATE INDEX IF NOT EXISTS idx_series_featured ON cv_series (featured) WHERE featured = TRUE;
      CREATE INDEX IF NOT EXISTS idx_series_imdb_id ON cv_series (imdb_id);
      CREATE INDEX IF NOT EXISTS idx_series_vidsrc ON cv_series (vidsrc_status);
    `,
  },
  {
    version: 2,
    name: "sports_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS sport_channels (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        url         TEXT NOT NULL UNIQUE,
        keyword     TEXT,
        date_added  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_matches (
        id           SERIAL PRIMARY KEY,
        channel_id   INTEGER REFERENCES sport_channels(id) ON DELETE CASCADE,
        yt_id        TEXT NOT NULL UNIQUE,
        title        TEXT NOT NULL,
        thumbnail    TEXT,
        published_at TIMESTAMPTZ,
        date_added   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      ALTER TABLE sport_channels ALTER COLUMN keyword DROP NOT NULL;
      ALTER TABLE sport_channels ALTER COLUMN keyword DROP DEFAULT;
    `,
  },
  {
    version: 3,
    name: "events_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS event_channels (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        url         TEXT NOT NULL UNIQUE,
        keyword     TEXT,
        date_added  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id           SERIAL PRIMARY KEY,
        channel_id   INTEGER REFERENCES event_channels(id) ON DELETE CASCADE,
        yt_id        TEXT NOT NULL UNIQUE,
        title        TEXT NOT NULL,
        thumbnail    TEXT,
        published_at TIMESTAMPTZ,
        date_added   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS event_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      ALTER TABLE event_channels ALTER COLUMN keyword DROP NOT NULL;
      ALTER TABLE event_channels ALTER COLUMN keyword DROP DEFAULT;
    `,
  },
  {
    version: 4,
    name: "sagas_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS cv_sagas (
        id SERIAL PRIMARY KEY,
        collection_id INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        overview TEXT,
        part_count INTEGER DEFAULT 0,
        is_curated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    version: 5,
    name: "import_jobs",
    sql: `
      CREATE TABLE IF NOT EXISTS import_jobs (
        id UUID PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('movie', 'series')),
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
        total INTEGER NOT NULL DEFAULT 0,
        processed INTEGER NOT NULL DEFAULT 0,
        imported INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        result JSONB NOT NULL DEFAULT '[]'::jsonb,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON import_jobs (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs (status);
    `,
  },
  {
    version: 6,
    name: "search_trigram_indexes",
    optional: true,
    sql: `
      CREATE EXTENSION IF NOT EXISTS pg_trgm;

      CREATE INDEX IF NOT EXISTS idx_movies_title_trgm
        ON movies USING GIN (title gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_series_title_trgm
        ON cv_series USING GIN (title gin_trgm_ops);
    `,
  },
  {
    version: 7,
    name: "series_slug_column",
    sql: `
      ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_series_slug ON cv_series (slug);
    `,
  },
];

/**
 * Seeds the curated saga collections.
 * Kept outside the migration list because it is idempotent data, not schema.
 */
export const SEED_CURATED_SAGAS = CURATED_COLLECTION_IDS;
