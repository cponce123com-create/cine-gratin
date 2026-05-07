import { Router, type Request, type Response } from "express";
import { tmdbFetch } from "../lib/tmdb-client";
import { pool } from "../lib/db";

const router = Router();

const TMDB_IMG = "https://image.tmdb.org/t/p";

/**
 * Well-known TMDB collection IDs for curated sagas.
 * Sourced from TMDB: /collection/{id}
 */
const CURATED_COLLECTION_IDS = [
  1771, // Marvel Cinematic Universe
  1241, // Harry Potter
  9485, // Fast & Furious
  119, // The Lord of the Rings
  10, // Star Wars
  415, // Batman (1989-1997, incluye algunas)
  645, // James Bond
  87359, // Jurassic Park / Jurassic World
  2344, // The Matrix
  8960, // Mission: Impossible
  239, // Indiana Jones
  1022790, // Pirates of the Caribbean
  539, // Toy Story
  111451, // Ice Age
  557, // Shrek
  263, // The Dark Knight Trilogy
  121938, // The Hobbit
  412, // Spider-Man (Raimi)
  131292, // The Hunger Games
  1570, // Transformers
  78, // Back to the Future
  153, // Rocky / Creed
  300, // Terminator
  8091, // Alien
  1579, // Die Hard
  1223848, // John Wick
  916, // X-Men
  180, // Star Trek (TOS)
  8945, // Madagascar
  84852, // Kung Fu Panda
];

interface TmdbCollectionPart {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  overview: string;
}

interface TmdbCollectionResponse {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  parts: TmdbCollectionPart[];
}

export interface SagaItem {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  part_count: number;
  overview: string;
}

export interface SagaPart {
  id: number;
  title: string;
  poster_url: string | null;
  backdrop_url: string | null;
  release_date: string;
  year: number | null;
  vote_average: number;
  overview: string;
  tmdb_id: number;
  local_id: string | null;
  is_imported: boolean;
}

export interface CvSagaRow {
  id: number;
  collection_id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  part_count: number;
  is_curated: boolean;
  created_at: string;
}

/**
 * Create the cv_sagas table if it doesn't exist and seed with curated collections.
 */
export async function initSagasTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cv_sagas (
        id SERIAL PRIMARY KEY,
        collection_id INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        overview TEXT,
        part_count INTEGER DEFAULT 0,
        is_curated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed curated collections — insert placeholder rows that will be enriched on first GET /api/sagas
    for (const cid of CURATED_COLLECTION_IDS) {
      await pool.query(
        `INSERT INTO cv_sagas (collection_id, name, is_curated)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (collection_id) DO NOTHING`,
        [cid, `Collection ${cid}`],
      );
    }
  } catch (e) {
    console.error("Failed to init cv_sagas table:", e);
  }
}

async function fetchCollection(id: number): Promise<TmdbCollectionResponse | null> {
  try {
    const res = await tmdbFetch(`/collection/${id}?language=es-MX`);
    if (!res.ok) {
      // fallback to English
      const enRes = await tmdbFetch(`/collection/${id}?language=en-US`);
      if (!enRes.ok) return null;
      return enRes.json() as Promise<TmdbCollectionResponse>;
    }
    return res.json() as Promise<TmdbCollectionResponse>;
  } catch {
    return null;
  }
}

/**
 * Find all local movie IDs (from the movies table) that match the given tmdb_ids.
 * Returns a Map<tmdb_id, local_id>.
 */
async function findLocalMoviesByTmdbIds(tmdbIds: number[]): Promise<Map<number, string>> {
  if (tmdbIds.length === 0) return new Map();
  try {
    const result = await pool.query(
      `SELECT tmdb_id, id FROM movies WHERE tmdb_id = ANY($1::int[]) AND tmdb_id IS NOT NULL`,
      [tmdbIds],
    );
    const map = new Map<number, string>();
    for (const row of result.rows) {
      map.set(Number(row.tmdb_id), row.id);
    }
    return map;
  } catch {
    return new Map();
  }
}

// GET /api/sagas — list all sagas from cv_sagas, enriched with live TMDB data
router.get("/sagas", async (_req: Request, res: Response) => {
  try {
    // Get all collection IDs from DB
    const dbResult = await pool.query(
      "SELECT collection_id FROM cv_sagas ORDER BY part_count DESC",
    );
    const collectionIds: number[] = dbResult.rows.map((r) => r.collection_id);

      // Fall back to curated list if table is empty (first run before seeding)
      const idsToUse = collectionIds.length > 0 ? collectionIds : CURATED_COLLECTION_IDS;

    // Process in batches of 5 with 300ms delay to avoid TMDB rate limits
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 300;
    const sagas: SagaItem[] = [];

    for (let i = 0; i < idsToUse.length; i += BATCH_SIZE) {
      const batch = idsToUse.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((id) => fetchCollection(id)));

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const col = result.value;
          sagas.push({
            id: col.id,
            name: col.name,
            poster_path: col.poster_path ? `${TMDB_IMG}/w500${col.poster_path}` : null,
            backdrop_path: col.backdrop_path ? `${TMDB_IMG}/w1280${col.backdrop_path}` : null,
            part_count: col.parts.length,
            overview: col.overview || "",
          });

          // Update DB row with live data
          try {
            await pool.query(
              `UPDATE cv_sagas SET name = $1, poster_path = $2, backdrop_path = $3, overview = $4, part_count = $5 WHERE collection_id = $6`,
              [
                col.name,
                col.poster_path ? `${TMDB_IMG}/w500${col.poster_path}` : null,
                col.backdrop_path ? `${TMDB_IMG}/w1280${col.backdrop_path}` : null,
                col.overview || "",
                col.parts.length,
                col.id,
              ],
            );
          } catch {
            // non-critical
          }
        }
      }

      // Delay between batches (skip after last batch)
      if (i + BATCH_SIZE < idsToUse.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // Sort by part_count descending
    sagas.sort((a, b) => b.part_count - a.part_count);

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.json(sagas);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/sagas/:id — full collection detail with all parts
// Each part includes local_id if the movie exists in the local DB.
router.get("/sagas/:id", async (req: Request, res: Response) => {
  const collectionId = Number(req.params.id);
  if (!collectionId || isNaN(collectionId)) {
    res.status(400).json({ error: "ID de colección inválido" });
    return;
  }

  try {
    const collection = await fetchCollection(collectionId);
    if (!collection) {
      res.status(404).json({ error: "Colección no encontrada en TMDB" });
      return;
    }

    const parts = collection.parts
      .filter((p) => p.title) // Only items with a title
      .sort((a, b) => {
        const yearA = a.release_date ? Number(a.release_date.slice(0, 4)) : 0;
        const yearB = b.release_date ? Number(b.release_date.slice(0, 4)) : 0;
        return yearA - yearB; // chronological order
      });

    // Look up which parts exist in the local movies DB
    const tmdbIds = parts.map((p) => p.id);
    const localMap = await findLocalMoviesByTmdbIds(tmdbIds);

    const enrichedParts: SagaPart[] = parts.map((p) => {
      const localId = localMap.get(p.id) || null;
      return {
        id: p.id,
        title: p.title,
        poster_url: p.poster_path ? `${TMDB_IMG}/w500${p.poster_path}` : null,
        backdrop_url: p.backdrop_path ? `${TMDB_IMG}/w1280${p.backdrop_path}` : null,
        release_date: p.release_date,
        year: p.release_date ? Number(p.release_date.slice(0, 4)) : null,
        vote_average: p.vote_average,
        overview: p.overview || "",
        tmdb_id: p.id,
        local_id: localId,
        is_imported: localId !== null,
      };
    });

    const result = {
      id: collection.id,
      name: collection.name,
      poster_path: collection.poster_path ? `${TMDB_IMG}/w500${collection.poster_path}` : null,
      backdrop_path: collection.backdrop_path ? `${TMDB_IMG}/w1280${collection.backdrop_path}` : null,
      overview: collection.overview || "",
      parts: enrichedParts,
    };

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Admin endpoints ─────────────────────────────────────────────────────────────

// GET /api/admin/sagas — list all rows from cv_sagas
router.get("/admin/sagas", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM cv_sagas ORDER BY part_count DESC",
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/sagas — add a custom saga by collection_id
router.post("/admin/sagas", async (req: Request, res: Response) => {
  const { collection_id } = req.body as { collection_id: number };

  if (!collection_id || isNaN(Number(collection_id))) {
    res.status(400).json({ error: "Se requiere un collection_id válido" });
    return;
  }

  try {
    // Check if already exists
    const existing = await pool.query(
      "SELECT * FROM cv_sagas WHERE collection_id = $1",
      [collection_id],
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Esta saga ya existe en la base de datos" });
      return;
    }

    // Fetch collection from TMDB
    const collection = await fetchCollection(collection_id);
    if (!collection) {
      res.status(404).json({ error: "Colección no encontrada en TMDB. Verifica el collection_id." });
      return;
    }

    const name = collection.name;
    const poster_path = collection.poster_path ? `${TMDB_IMG}/w500${collection.poster_path}` : null;
    const backdrop_path = collection.backdrop_path ? `${TMDB_IMG}/w1280${collection.backdrop_path}` : null;
    const overview = collection.overview || "";
    const part_count = collection.parts.length;

    const insertResult = await pool.query(
      `INSERT INTO cv_sagas (collection_id, name, poster_path, backdrop_path, overview, part_count, is_curated)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING *`,
      [collection_id, name, poster_path, backdrop_path, overview, part_count],
    );

    res.json(insertResult.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/admin/sagas/:collection_id — delete a custom saga
router.delete("/admin/sagas/:collection_id", async (req: Request, res: Response) => {
  const collectionId = Number(req.params.collection_id);
  if (!collectionId || isNaN(collectionId)) {
    res.status(400).json({ error: "ID de colección inválido" });
    return;
  }

  try {
    const row = await pool.query(
      "SELECT is_curated FROM cv_sagas WHERE collection_id = $1",
      [collectionId],
    );

    if (row.rows.length === 0) {
      res.status(404).json({ error: "Saga no encontrada" });
      return;
    }

    if (row.rows[0].is_curated) {
      res.status(403).json({ error: "No se puede eliminar una saga predefinida" });
      return;
    }

    await pool.query("DELETE FROM cv_sagas WHERE collection_id = $1", [collectionId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
