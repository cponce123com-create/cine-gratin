import { Router, type IRouter } from "express";
import { adminAuth } from "../middlewares/adminAuth";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import moviesRouter from "./movies";
import seriesRouter from "./series";
import adminRouter from "./admin";
import sportsRouter, { initSportsTables } from "./sports";
import eventsRouter, { initEventsTables } from "./events";

const router: IRouter = Router();

router.use(adminAuth);
router.use(healthRouter);
router.use(tmdbRouter);
router.use(moviesRouter);
router.use(seriesRouter);
router.use(adminRouter);
router.use(sportsRouter);
router.use(eventsRouter);

export { initSportsTables, initEventsTables };
export default router;
