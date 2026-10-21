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

export default router;
