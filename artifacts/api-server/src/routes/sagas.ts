import { Router, type Request, type Response } from "express";
import { tmdbFetch } from "../lib/tmdb-client";

const router = Router();

const TMDB_IMG = "https://image.tmdb.org/t/p";

/**
 * Well-known TMDB collection IDs for curated sagas.
 * Sourced from TMDB: /collection/{id}
 */
const CURATED_COLLECTION_IDS = [
  1771,  // Marvel Cinematic Universe
  1241,  // Harry Potter
  9485,  // Fast & Furious
  119,   // The Lord of the Rings
  10,    // Star Wars
  415,   // Batman (1989-1997, incluye algunas)
  645,   // James Bond
  87359, // Jurassic Park / Jurassic World
  2344,  // The Matrix
  8960,  // Mission: Impossible
  239,   // Indiana Jones
  1022790, // Pirates of the Caribbean
  539,   // Toy Story
  111451, // Ice Age
  557,   // Shrek
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

// GET /api/sagas — curated list of top sagas, sorted by part_count descending
router.get("/sagas", async (_req: Request, res: Response) => {
  try {
    const results = await Promise.allSettled(
      CURATED_COLLECTION_IDS.map((id) => fetchCollection(id))
    );

    const sagas: SagaItem[] = [];

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
      })
      .map((p) => ({
        id: p.id,
        title: p.title,
        poster_url: p.poster_path ? `${TMDB_IMG}/w500${p.poster_path}` : null,
        backdrop_url: p.backdrop_path ? `${TMDB_IMG}/w1280${p.backdrop_path}` : null,
        release_date: p.release_date,
        year: p.release_date ? Number(p.release_date.slice(0, 4)) : null,
        vote_average: p.vote_average,
        overview: p.overview || "",
      }));

    const result = {
      id: collection.id,
      name: collection.name,
      poster_path: collection.poster_path ? `${TMDB_IMG}/w500${collection.poster_path}` : null,
      backdrop_path: collection.backdrop_path ? `${TMDB_IMG}/w1280${collection.backdrop_path}` : null,
      overview: collection.overview || "",
      parts,
    };

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
