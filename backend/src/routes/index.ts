import { Router, type IRouter, type Request, type Response } from "express";
import { adminAuth } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import moviesRouter from "./movies";
import seriesRouter from "./series";
import adminRouter from "./admin";
import sportsRouter, { initSportsTables } from "./sports";
import eventsRouter, { initEventsTables } from "./events";
import sagasRouter, { initSagasTable } from "./sagas";
import downloadRouter from "./download";

const router: IRouter = Router();

// ── Public: client-side error reporting (no auth required) ───────────────────
router.post("/log-error", (req: Request, res: Response) => {
  const { message, stack, componentStack, url, userAgent } = req.body ?? {};
  logger.warn({ message, stack, componentStack, url, userAgent }, "[Client Error]");
  res.status(200).json({ ok: true });
});

router.use(adminAuth);
router.use(healthRouter);
router.use(tmdbRouter);
router.use(moviesRouter);
router.use(seriesRouter);
router.use(adminRouter);
router.use(sportsRouter);
router.use(eventsRouter);
router.use(sagasRouter);
router.use(downloadRouter);

export { initSportsTables, initEventsTables, initSagasTable };
export default router;
