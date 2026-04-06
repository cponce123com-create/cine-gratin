import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import moviesRouter from "./movies";
import seriesRouter from "./series";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tmdbRouter);
router.use(moviesRouter);
router.use(seriesRouter);

export default router;
