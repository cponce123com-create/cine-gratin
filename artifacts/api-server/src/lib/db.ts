import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
}

export { pool };
