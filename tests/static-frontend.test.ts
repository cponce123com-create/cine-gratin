import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { brotliCompressSync } from "node:zlib";
import path from "node:path";
import request from "supertest";
import app from "../backend/src/app";

/**
 * Regression tests for the static frontend.
 *
 * The service is deployed as a single process: the API also serves the compiled
 * frontend. These tests reproduce that scenario (a `index.html` inside
 * `backend/public`) and check that the root path and the client-side routes
 * are served correctly — in Express 5 the wildcard `/*path` does not match "/",
 * which previously made the deployed site answer 404 on its home page.
 */
const publicDir = path.resolve(__dirname, "../backend/public");
const indexPath = path.join(publicDir, "index.html");
const hadIndex = existsSync(indexPath);
const previousContent = hadIndex ? readFileSafe(indexPath) : null;

function readFileSafe(file: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(file, "utf8") as string;
}

describe("servicio del frontend estático", () => {
  beforeAll(() => {
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(
      indexPath,
      '<!DOCTYPE html><html lang="es"><head><title>Cine Gratín</title></head><body><div id="root"></div></body></html>',
      "utf8",
    );
  });

  afterAll(() => {
    if (hadIndex && previousContent !== null) {
      writeFileSync(indexPath, previousContent, "utf8");
    } else {
      rmSync(indexPath, { force: true });
    }
  });

  it("sirve la portada en la raíz", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Cine Gratín");
  });

  it("sirve las rutas del cliente (SPA) con el index.html", async () => {
    for (const route of ["/peliculas", "/series", "/admin/movies", "/ruta-inexistente"]) {
      const response = await request(app).get(route);
      expect(response.status, `ruta ${route}`).toBe(200);
      expect(response.text).toContain('id="root"');
    }
  });

  it("no sirve el index.html en las rutas de la API", async () => {
    const response = await request(app).get("/api/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("devuelve un 404 en JSON para rutas de API inexistentes", async () => {
    const response = await request(app).get("/api/no-existe");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("not_found");
  });

  it("no almacena en cache las respuestas administrativas", async () => {
    const response = await request(app).get("/api/admin/stats");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("sirre los assets precomprimidos con su tipo de contenido real", async () => {
    // La variante .br/.gz se deduce de la extension del fichero comprimido:
    // sin el Content-Type correcto, el navegador descarga el script en lugar
    // de ejecutarlo (y con nosniff lo rechaza).
    const publicDir = path.resolve(__dirname, "../backend/public");
    const assetDir = path.join(publicDir, "assets");
    mkdirSync(assetDir, { recursive: true });

    const asset = path.join(assetDir, "prueba-tipo.js");
    const variant = path.join(assetDir, "prueba-tipo.js.br");
    const source = "export const valor = 1;\n";
    writeFileSync(asset, source, "utf8");
    // La variante tiene que ser un brotli real: el cliente la descomprime.
    writeFileSync(variant, brotliCompressSync(Buffer.from(source, "utf8")));

    try {
      const response = await request(app).get("/assets/prueba-tipo.js").set("Accept-Encoding", "br");

      expect(response.status).toBe(200);
      expect(response.headers["content-encoding"]).toBe("br");
      expect(response.headers["content-type"]).toContain("javascript");
    } finally {
      rmSync(asset, { force: true });
      rmSync(variant, { force: true });
    }
  });

  it("acepta la cabecera X-CSRF-Token en el preflight de CORS", async () => {
    const response = await request(app)
      .options("/api/admin/import-jobs/preview")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token");

    expect(response.status).toBe(204);
    const allowed = String(response.headers["access-control-allow-headers"] ?? "");
    expect(allowed.toLowerCase()).toContain("x-csrf-token");
  });
});
