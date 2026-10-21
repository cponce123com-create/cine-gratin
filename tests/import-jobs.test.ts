import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../backend/src/lib/db";
import { getConfig, setConfig } from "../backend/src/lib/config";
import {
  cancelImportJob,
  createImportJob,
  getImportJob,
  listImportJobs,
  normalizeJobItems,
  previewItems,
  processImportJob,
  processNextQueuedJob,
  reapStaleJobs,
} from "../backend/src/lib/import-jobs";

/**
 * Import job engine.
 *
 * The provider is mocked: the state machine, the database writes and the
 * counters are exercised for real, but no request leaves the machine.
 */

const tmdbState = {
  /** Number of calls that fail with a temporary error before succeeding. */
  transientFailures: 0,
  /** Every call fails with a temporary error. */
  alwaysFail: false,
  /** Delay applied to each item, in milliseconds. */
  delayMs: 0,
  /** Identifiers that always fail with a permanent error. */
  permanentFailures: new Set<string>(),
  calls: 0,
};

vi.mock("../backend/src/lib/tmdb-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../backend/src/lib/tmdb-client")>();

  return {
    ...actual,
    tmdbFetch: vi.fn(async (path: string) => {
      const raw = path.split("/").pop() ?? "0";
      const digits = raw.replace(/\D/g, "");
      const id = Number(digits.slice(0, 7)) || 1;
      if (tmdbState.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, tmdbState.delayMs));
      }
      if (tmdbState.transientFailures > 0) {
        tmdbState.transientFailures -= 1;
        return { ok: false, status: 429, json: async () => ({}) } as unknown as Response;
      }
      if (tmdbState.alwaysFail) {
        return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          movie_results: [{ id: Number(id) || 1 }],
          tv_results: [{ id: Number(id) || 1 }],
        }),
      } as unknown as Response;
    }),
    fetchMovieByTmdbId: vi.fn(async (tmdbId: number) => {
      tmdbState.calls += 1;
      if (tmdbState.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, tmdbState.delayMs));
      }
      if (tmdbState.permanentFailures.has(String(tmdbId))) {
        throw new Error("Identificador inválido");
      }
      if (tmdbState.alwaysFail) {
        const error = new Error("Fallo temporal del proveedor") as Error & { status?: number };
        error.status = 503;
        throw error;
      }
      return {
        imdb_id: `tt${String(tmdbId).padStart(7, "0")}`,
        tmdb_id: tmdbId,
        title: `Película ${tmdbId}`,
        year: 2020,
        rating: 7,
        runtime: 120,
        genres: ["Prueba"],
        language: "es",
        synopsis: "Descripción de prueba",
        director: "Director",
        cast_list: ["Actor"],
        cast_full: [],
        networks: [],
        poster_url: "https://image.tmdb.org/p.jpg",
        background_url: "https://image.tmdb.org/b.jpg",
        yt_trailer_code: "",
        videos: [],
        reviews: [],
        mpa_rating: "NR",
        slug: `pelicula-${tmdbId}`,
      };
    }),
    fetchSeriesByTmdbId: vi.fn(async (tmdbId: number) => {
      tmdbState.calls += 1;
      if (tmdbState.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, tmdbState.delayMs));
      }
      return {
        imdb_id: `tt${String(tmdbId).padStart(7, "0")}`,
        tmdb_id: tmdbId,
        title: `Serie ${tmdbId}`,
        year: 2021,
        end_year: null,
        rating: 8,
        genres: ["Prueba"],
        language: "es",
        synopsis: "Descripción de prueba",
        creators: ["Creador"],
        cast_list: ["Actor"],
        cast_full: [],
        networks: [],
        poster_url: "https://image.tmdb.org/p.jpg",
        background_url: "https://image.tmdb.org/b.jpg",
        yt_trailer_code: "",
        videos: [],
        reviews: [],
        status: "Ended",
        total_seasons: 1,
        seasons_data: [],
        slug: `serie-${tmdbId}`,
      };
    }),
  };
});

/** Waits until the job reaches a final state. */
async function waitForJob(
  id: string,
  timeoutMs = 15000,
): Promise<NonNullable<Awaited<ReturnType<typeof getImportJob>>>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getImportJob(id);
    if (job && ["completed", "partial", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("El trabajo no terminó a tiempo");
}

describe("motor de trabajos de importación", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM import_jobs");
    await pool.query("DELETE FROM movies WHERE imdb_id LIKE 'tt900%' OR imdb_id LIKE 'tt0000%'");
  });

  beforeEach(() => {
    tmdbState.transientFailures = 0;
    tmdbState.alwaysFail = false;
    tmdbState.delayMs = 0;
    tmdbState.permanentFailures = new Set();
    tmdbState.calls = 0;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM import_jobs");
    await pool.query("DELETE FROM movies WHERE imdb_id LIKE 'tt900%'");
    await pool.end().catch(() => undefined);
  });

  it("normaliza los identificadores y descarta los inválidos", () => {
    const { valid, invalid } = normalizeJobItems(["tt9000001", "TT9000001", "550", "no-es-un-id", ""]);
    expect(valid).toEqual(["tt9000001", "550"]);
    // Los identificadores vacios se ignoran: no son entradas invalidas.
    expect(invalid).toEqual(["no-es-un-id"]);
  });

  it("rechaza un trabajo que supera el límite configurado", async () => {
    const config = getConfig();
    const limit = config.importBatchLimit;
    const items = Array.from({ length: limit + 1 }, (_, index) => `tt${String(index).padStart(7, "0")}`);

    await expect(createImportJob({ type: "movie", source: "test", items })).rejects.toThrow(
      /límite configurado/,
    );
  });

  it("importa el contenido y no crea duplicados", async () => {
    const job = await createImportJob({ type: "movie", source: "test", items: ["tt9000001"] });
    const finished = await waitForJob(job.id);

    expect(finished.status).toBe("completed");
    expect(finished.imported).toBe(1);
    expect(finished.failed).toBe(0);
    expect(finished.pending).toBe(0);
    expect(finished.result[0].status).toBe("imported");

    const { rows } = await pool.query("SELECT id FROM movies WHERE imdb_id = 'tt9000001'");
    expect(rows).toHaveLength(1);

    // Una segunda importación del mismo título no crea otro registro.
    const second = await createImportJob({ type: "movie", source: "test", items: ["tt9000001"] });
    const secondFinished = await waitForJob(second.id);
    expect(secondFinished.status).toBe("completed");
    expect(secondFinished.imported).toBe(0);
    expect(secondFinished.skipped).toBe(1);
    expect(secondFinished.result[0].status).toBe("existed");

    const after = await pool.query("SELECT id FROM movies WHERE imdb_id = 'tt9000001'");
    expect(after.rows).toHaveLength(1);
  });

  it("reintenta los fallos temporales del proveedor", async () => {
    tmdbState.transientFailures = 2;
    const job = await createImportJob({ type: "movie", source: "test", items: ["tt9000002"] });
    const finished = await waitForJob(job.id);

    expect(finished.status).toBe("completed");
    expect(finished.imported).toBe(1);
    expect(finished.failed).toBe(0);
  });

  it("no reintenta un identificador inválido", async () => {
    const job = await createImportJob({ type: "movie", source: "test", items: ["no-es-un-id"] });
    const finished = await waitForJob(job.id);

    expect(finished.status).toBe("completed");
    expect(finished.result[0].status).toBe("not_found");
    expect(finished.failed).toBe(0);
  });

  it("conserva el identificador de entrada en el error", async () => {
    tmdbState.alwaysFail = true;
    const job = await createImportJob({ type: "movie", source: "test", items: ["tt9000003"] });
    const finished = await waitForJob(job.id);

    expect(finished.status).toBe("partial");
    expect(finished.failed).toBe(1);
    expect(finished.result[0].input).toBe("tt9000003");
    expect(finished.result[0].status).toBe("error");
  });

  it("un trabajo cancelado antes de empezar no se ejecuta", async () => {
    const items = Array.from({ length: 5 }, (_, index) => `tt9${String(index + 200).padStart(6, "0")}`);
    const job = await createImportJob({ type: "movie", source: "test", items });

    // Se cancela mientras el trabajo sigue en la cola.
    const cancelled = await cancelImportJob(job.id);
    expect(cancelled?.status).toBe("cancelled");

    // Aunque el worker intente tomarlo, ya no puede: no está en cola.
    await processImportJob(job.id);

    // Se espera a que el processor cierre el trabajo (si lo tenía tomado).
    const settleDeadline = Date.now() + 20000;
    let finished = await getImportJob(job.id);
    while (
      Date.now() < settleDeadline &&
      finished &&
      finished.processed + finished.pending !== items.length
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      finished = await getImportJob(job.id);
    }

    expect(finished?.status).toBe("cancelled");
    // Los elementos que no llegaron a procesarse quedan como pendientes y
    // nunca como errores.
    expect(finished?.failed).toBe(0);
    expect((finished?.processed ?? 0) + (finished?.pending ?? 0)).toBe(items.length);
  });

  it("cancelar un trabajo en curso no convierte lo pendiente en errores", async () => {
    tmdbState.delayMs = 150;
    const items = Array.from({ length: 12 }, (_, index) => `tt9${String(index + 300).padStart(6, "0")}`);
    const job = await createImportJob({ type: "movie", source: "test", items });

    // Se espera a que el trabajo esté realmente en curso antes de cancelarlo.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const current = await getImportJob(job.id);
      if (current?.status === "running") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await cancelImportJob(job.id);

    // El processor termina los elementos en vuelo y contabiliza los que no
    // llegaron a empezar: la suma siempre cuadra con el total.
    const settleDeadline = Date.now() + 20000;
    let finished = await getImportJob(job.id);
    while (
      Date.now() < settleDeadline &&
      finished &&
      finished.processed + finished.pending !== items.length
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      finished = await getImportJob(job.id);
    }

    expect(finished?.status).toBe("cancelled");
    // Los elementos no iniciados no se cuentan como errores.
    expect(finished?.failed).toBe(0);
    expect((finished?.processed ?? 0) + (finished?.pending ?? 0)).toBe(items.length);
  });

  it("sólo un trabajo se ejecuta a la vez: el otro queda en cola", async () => {
    tmdbState.delayMs = 200;
    const first = await createImportJob({
      type: "movie",
      source: "test",
      items: ["tt9000201", "tt9000202", "tt9000203"],
    });
    const second = await createImportJob({ type: "movie", source: "test", items: ["tt9000204"] });

    const firstFinished = await waitForJob(first.id, 20000);
    expect(["completed", "partial"]).toContain(firstFinished.status);

    // Al terminar el primero, el segundo sigue en la cola: nunca se marca como
    // fallido por una condicion temporal de concurrencia.
    const queued = await getImportJob(second.id);
    expect(queued?.status).toBe("queued");
    expect(queued?.error).toBeNull();

    // El worker del proceso reclama el siguiente trabajo de la cola.
    await processNextQueuedJob();
    const secondFinished = await waitForJob(second.id, 20000);
    expect(["completed", "partial"]).toContain(secondFinished.status);
    expect(secondFinished.failed).toBe(0);
  });

  it("el trabajo se puede reclamar una sola vez", async () => {
    const job = await createImportJob({ type: "movie", source: "test", items: ["tt9000301"] });
    const first = await processImportJob(job.id);
    const second = await processImportJob(job.id);

    // El segundo intento no vuelve a procesar el trabajo (ya no está en cola).
    expect(first?.id).toBe(job.id);
    expect(second?.status).toBe("completed");
    expect(second?.processed).toBeLessThanOrEqual(1);
  });

  it("un trabajo con el lease caducado vuelve a la cola", async () => {
    const id = "11111111-2222-3333-4444-555555555555";
    await pool.query(
      `INSERT INTO import_jobs (id, type, source, status, total, payload, lease_expires_at, attempts)
       VALUES ($1, 'movie', 'test', 'running', 1, '{"items":["tt9000401"]}'::jsonb, NOW() - INTERVAL '10 minutes', 1)`,
      [id],
    );

    const reaped = await reapStaleJobs();
    expect(reaped).toBeGreaterThanOrEqual(1);

    const job = await getImportJob(id);
    expect(job?.status).toBe("queued");
  });

  it("la vista previa no escribe nada y clasifica cada elemento", async () => {
    const preview = await previewItems(["tt9000001", "no-es-un-id"], "movie");

    expect(preview).toHaveLength(2);
    expect(preview[0].status).toBe("existed");
    expect(preview[1].status).toBe("invalid");

    const { rows } = await pool.query("SELECT id FROM movies WHERE imdb_id = 'tt9000001'");
    expect(rows).toHaveLength(1);
  });

  it("el historial lista los trabajos recientes", async () => {
    const job = await createImportJob({ type: "movie", source: "historial", items: ["tt9000501"] });
    await waitForJob(job.id);

    const jobs = await listImportJobs(5);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].id).toBe(job.id);
  });

  it("la configuración de importacion se puede ajustar y validar", () => {
    const config = getConfig();
    expect(config.importConcurrency).toBeGreaterThanOrEqual(1);
    expect(config.importConcurrency).toBeLessThanOrEqual(16);
    expect(config.importBatchLimit).toBeGreaterThanOrEqual(1);
    expect(config.importJobLeaseSeconds).toBeGreaterThanOrEqual(30);

    // El valor por defecto se puede cambiar de forma explícita.
    setConfig({ ...config, importConcurrency: 5 });
    expect(getConfig().importConcurrency).toBe(5);
    setConfig(config);
  });
});
