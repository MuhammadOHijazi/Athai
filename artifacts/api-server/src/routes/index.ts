import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generationsRouter from "./generations";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generationsRouter);
router.use(dashboardRouter);

export default router;
