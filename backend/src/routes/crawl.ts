import { Router } from "express";
import { triggerCrawlStart, triggerCrawlStop, getCrawlStatus } from "../controllers/crawlController";

const router = Router();

router.post("/start", triggerCrawlStart);
router.post("/stop", triggerCrawlStop);
router.get("/status", getCrawlStatus);

export default router;
