import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDb() {
  await pool.query(`
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
      password TEXT NOT NULL DEFAULT 'admin123'
    );

    INSERT INTO cv_auth (id, password) VALUES ('admin', 'admin123')
      ON CONFLICT (id) DO NOTHING;

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
  `);

  // Migrations for new columns
  await pool.query(`
    ALTER TABLE movies ADD COLUMN IF NOT EXISTS vidsrc_status TEXT DEFAULT 'unknown';
    ALTER TABLE movies ADD COLUMN IF NOT EXISTS auto_imported BOOLEAN DEFAULT FALSE;
    ALTER TABLE movies ADD COLUMN IF NOT EXISTS networks TEXT[] DEFAULT '{}';
    ALTER TABLE movies ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]';
    ALTER TABLE movies ADD COLUMN IF NOT EXISTS reviews JSONB DEFAULT '[]';
    ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_id INTEGER;
    ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_name TEXT;
    ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS vidsrc_status TEXT DEFAULT 'unknown';
    ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS auto_imported BOOLEAN DEFAULT FALSE;
    ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS networks TEXT[] DEFAULT '{}';
    ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]';
    ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS reviews JSONB DEFAULT '[]';
    ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS collection_id INTEGER;
    ALTER TABLE cv_series ADD COLUMN IF NOT EXISTS collection_name TEXT;

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
  `);

  // Performance indexes
  await pool.query(`
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
  `);
}

export { pool };
