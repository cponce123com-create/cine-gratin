import { Router } from "express";
import { pool } from "../lib/db";

const router = Router();

/**
 * Liveness probe: the process is up and able to answer.
 * It must not touch the database so a database outage does not restart the app.
 */
router.get("/healthz", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "ok" });
});

/**
 * Readiness probe: the process can serve traffic, which requires the database.
 * The check is time-boxed and never reveals connection details.
 */
router.get("/readyz", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    res.json({ status: "ready", database: "up" });
  } catch {
    res.status(503).json({ status: "not_ready", database: "down" });
  }
});

/**
 * Escape hatch for the browser cache.
 *
 * The service worker caches the application shell. If a deployment leaves an
 * old copy in the browser (for example, an asset served with a wrong
 * `Content-Type`), the page can stay broken until the caches expire. This
 * endpoint asks the browser to drop its caches (the `Clear-Site-Data` header)
 * and reloads the site.
 *
 * It is public on purpose: it only affects the cache of the client that calls
 * it and it never touches the session (the cookie is preserved).
 */
router.get("/reset-cache", (_req, res) => {
  res.setHeader("Clear-Site-Data", '"cache", "storage"');
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Cine Gratín</title>
    <meta http-equiv="refresh" content="0; url=/" />
  </head>
  <body>
    <p>Cache del navegador borrada. <a href="/">Volver a Cine Gratín</a>.</p>
  </body>
</html>`,
  );
});

export default router;
