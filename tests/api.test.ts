import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../backend/src/app";
import { pool } from "../backend/src/lib/db";
import { getConfig } from "../backend/src/lib/config";
import { generateToken } from "../backend/src/lib/auth-utils";
import { importByImdbId } from "../backend/src/jobs/auto-import";

/**
 * Integration tests against the API.
 * They run against the isolated test database configured in `vitest.config.ts`.
 */
const skipDatabase = process.env["SKIP_DATABASE_TESTS"] === "true";

const ADMIN_PATHS = [
  "/api/admin/stats",
  "/api/admin/movies",
  "/api/admin/series",
  "/api/admin/sagas",
  "/api/admin/import-jobs",
  "/api/admin/auto-import/status",
  "/api/admin/verify-vidsrc",
  "/api/admin/cleanup-no-vidsrc",
  "/api/admin/cleanup-missing-images",
  "/api/admin/tmdb-genres/movie",
];

function adminToken(username = "admin"): string {
  return generateToken(username);
}

describe("API · rutas administrativas", () => {
  it.each(ADMIN_PATHS)("rechaza %s sin token", async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("unauthorized");
  });

  it.each(ADMIN_PATHS)("rechaza %s con un token inválido", async (path) => {
    const response = await request(app).get(path).set("Authorization", "Bearer token-invalido");
    expect(response.status).toBe(401);
  });

  it("rechaza el tokendeprecated en la query string", async () => {
    const response = await request(app).get("/api/admin/stats?token=admin");
    expect(response.status).toBe(401);
  });

  it("rechaza un token caducado", async () => {
    const expired = jwt.sign({ username: "admin", role: "admin" }, getConfig().jwtSecret, {
      expiresIn: "-1h",
    });
    const response = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${expired}`);
    expect(response.status).toBe(401);
  });

  it("acepta un token válido", async () => {
    const response = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.global).toHaveProperty("movies");
  });

  it("exige autorización en las operaciones de escritura", async () => {
    const response = await request(app).post("/api/admin/movies").send({ title: "Película sin sesión" });
    expect(response.status).toBe(401);
  });
});

afterAll(async () => {
  // The pool is shared by the whole file: it is closed only once.
  await pool.end().catch(() => undefined);
});

describe.skipIf(skipDatabase)("API · catálogo y base de datos", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM movies");
    await pool.query("DELETE FROM cv_series");
    await pool.query("DELETE FROM cv_servers");
    await pool.query("DELETE FROM cv_settings");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM movies");
    await pool.query("DELETE FROM cv_series");
  });

  it("no expone columnas privadas en la API pública", async () => {
    const response = await request(app).get("/api/movies");
    expect(response.status).toBe(200);

    const sample = response.body[0];
    if (sample) {
      expect(sample).not.toHaveProperty("password");
      expect(sample).not.toHaveProperty("username");
      expect(sample).not.toHaveProperty("cast_full_secret");
    }
  });

  it("no expone los ajustes sensibles en la API pública", async () => {
    await pool.query(
      `INSERT INTO cv_settings (key, value) VALUES ('youtube_api_key', 'super-secreto')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    await pool.query(
      `INSERT INTO cv_settings (key, value) VALUES ('auto_import_enabled', 'true')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );

    const response = await request(app).get("/api/settings");
    expect(response.status).toBe(200);
    expect(response.body["youtube_api_key"]).toBeUndefined();
    expect(response.body["auto_import_enabled"]).toBe("true");

    const adminResponse = await request(app)
      .get("/api/admin/settings")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body["youtube_api_key"]).toBe("super-secreto");
  });

  it("rechaza paginaciones imposibles", async () => {
    const response = await request(app).get("/api/movies?limit=100000");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("bad_request");
  });

  it("busca texto y género en los catálogos públicos de películas y series", async () => {
    await pool.query(
      `INSERT INTO movies (id, imdb_id, title, year, rating, genres, synopsis)
       VALUES ('tt9988701', 'tt9988701', 'Perro de prueba', 2024, 8.2, ARRAY['Animación'], 'Una historia de un perro')
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, genres = EXCLUDED.genres, synopsis = EXCLUDED.synopsis`,
    );
    await pool.query(
      `INSERT INTO cv_series (id, imdb_id, title, year, rating, genres, synopsis)
       VALUES ('tt9988702', 'tt9988702', 'Perro de prueba en serie', 2024, 8.1, ARRAY['Animación'], 'Una serie sobre un perro')
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, genres = EXCLUDED.genres, synopsis = EXCLUDED.synopsis`,
    );

    for (const query of ["q=perro&sort=year", "q=perro&genre=Animaci%C3%B3n&sort=rating"]) {
      const movies = await request(app).get(`/api/movies/catalogue?${query}`);
      expect(movies.status).toBe(200);
      expect(movies.body.items.some((item: { id: string }) => item.id === "tt9988701")).toBe(true);

      const series = await request(app).get(`/api/series/catalogue?${query}`);
      expect(series.status).toBe(200);
      expect(series.body.items.some((item: { id: string }) => item.id === "tt9988702")).toBe(true);
    }
  });

  it("pagina el catálogo de administración", async () => {
    await pool.query("DELETE FROM movies WHERE id = 'tt9988701'");

    for (let index = 1; index <= 7; index++) {
      await pool.query(`INSERT INTO movies (id, imdb_id, title, year, genres) VALUES ($1, $2, $3, $4, $5)`, [
        `tt000000${index}`,
        `tt000000${index}`,
        `Película de prueba ${index}`,
        2000 + index,
        ["Prueba"],
      ]);
    }

    const response = await request(app)
      .get("/api/admin/movies?page=1&limit=3&sort=title&order=asc")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(3);
    expect(response.body.total).toBe(7);
    expect(response.body.pages).toBe(3);
    expect(response.body.items[0].title).toBe("Película de prueba 1");
  });

  it("las operaciones masivas sobre servidores usan una transacción", async () => {
    await pool.query(
      `INSERT INTO cv_servers (id, name, base_url, active, sort_order)
       VALUES ('server-a', 'Servidor A', 'https://a.example', TRUE, 0)`,
    );

    // One invalid entry (id too long) makes the whole operation fail: the
    // previous list must be preserved instead of being wiped.
    const response = await request(app)
      .post("/api/servers")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send([{ id: "x".repeat(200), name: "Servidor inválido", base_url: "https://b.example" }]);

    expect(response.status).toBe(400);

    const { rows } = await pool.query("SELECT id FROM cv_servers");
    expect(rows.map((row) => (row as { id: string }).id)).toContain("server-a");
  });

  it("la limpieza masiva exige autorización y informa del alcance", async () => {
    const unauthorized = await request(app).post("/api/admin/cleanup-no-vidsrc").send({});
    expect(unauthorized.status).toBe(401);

    await pool.query(
      `INSERT INTO movies (id, imdb_id, title, year, vidsrc_status)
       VALUES ('tt9999999', 'tt9999999', 'Sin póster', 2020, 'inactive')`,
    );

    const preview = await request(app)
      .post("/api/admin/cleanup-no-vidsrc")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    expect(preview.status).toBe(200);
    expect(preview.body.preview).toBe(true);
    expect(preview.body.would_delete.movies).toBeGreaterThanOrEqual(1);

    // The preview must not delete anything.
    const { rows } = await pool.query("SELECT id FROM movies WHERE id = 'tt9999999'");
    expect(rows).toHaveLength(1);

    const confirmed = await request(app)
      .post("/api/admin/cleanup-no-vidsrc")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ confirm: true });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.summary.movies).toBeGreaterThanOrEqual(1);
  });

  it("el recuento de la verificación de disponibilidad es correcto", async () => {
    await pool.query(
      `INSERT INTO movies (id, imdb_id, title, year, vidsrc_status)
       VALUES ('tt1000001', 'tt1000001', 'Disponible', 2021, 'unknown')
       ON CONFLICT (id) DO UPDATE SET vidsrc_status = 'unknown'`,
    );

    const response = await request(app)
      .post("/api/admin/verify-vidsrc")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        results: [
          { imdb_id: "tt1000001", type: "movie", available: true },
          { imdb_id: "tt1000002", type: "movie", available: false },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(1);
    expect(response.body.inactive).toBe(0);
    expect(response.body.saved).toBe(1);
    expect(response.body.not_found).toBe(1);

    const { rows } = await pool.query("SELECT vidsrc_status FROM movies WHERE id = 'tt1000001'");
    expect((rows[0] as { vidsrc_status: string }).vidsrc_status).toBe("active");
  });

  it("rechaza un payload de verificación inválido", async () => {
    const response = await request(app)
      .post("/api/admin/verify-vidsrc")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ results: [{ imdb_id: "no-es-un-id", type: "movie", available: true }] });

    expect(response.status).toBe(400);
  });
});

const skipImport = skipDatabase || !process.env["TMDB_API_KEY"];

describe.skipIf(skipImport)("importación", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM movies WHERE id LIKE 'auto_tt0111161'");
  });

  it("no crea duplicados al importar dos veces el mismo título", async () => {
    const first = await importByImdbId("tt0111161", "movie");
    const second = await importByImdbId("tt0111161", "movie");

    expect(first.status).toBe("imported");
    expect(second.status).toBe("existed");

    const { rows } = await pool.query("SELECT id FROM movies WHERE imdb_id = 'tt0111161'");
    expect(rows).toHaveLength(1);
  });

  it("no sobrescribe los campos editados manualmente", async () => {
    await pool.query(
      `UPDATE movies SET title = 'Título editado a mano', poster_url = 'https://manual.example/p.jpg'
       WHERE imdb_id = 'tt0111161'`,
    );

    await importByImdbId("tt0111161", "movie");

    const { rows } = await pool.query("SELECT title, poster_url FROM movies WHERE imdb_id = 'tt0111161'");
    expect((rows[0] as { title: string }).title).toBe("Título editado a mano");
    expect((rows[0] as { poster_url: string }).poster_url).toBe("https://manual.example/p.jpg");
  });

  it("no deja registros a medias cuando el proveedor falla", async () => {
    const before = await pool.query("SELECT COUNT(*)::int AS total FROM movies");
    const totalBefore = (before.rows[0] as { total: number }).total;

    const result = await importByImdbId("tt0000000", "movie");
    expect(["not_found", "error"]).toContain(result.status);

    const after = await pool.query("SELECT COUNT(*)::int AS total FROM movies");
    expect((after.rows[0] as { total: number }).total).toBe(totalBefore);
  });
});
