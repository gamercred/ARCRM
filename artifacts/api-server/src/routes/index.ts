import { Router, type IRouter } from "express";
import healthRouter from "./health";
import invoicesRouter from "./invoices";
import analystsRouter from "./analysts";
import commentsRouter from "./comments";
import dashboardRouter from "./dashboard";
import emailsRouter from "./emails";
import aiRouter from "./ai";
import importArRouter from "./import-ar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(invoicesRouter);
router.use(analystsRouter);
router.use(commentsRouter);
router.use(dashboardRouter);
router.use(emailsRouter);
router.use(aiRouter);
router.use(importArRouter);

export default router;
