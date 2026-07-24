import { Router } from "express";
import { triggerScrape, triggerNewTenderScrape, scrapeStatus } from "../controllers/scrapeController";

const router = Router();

// POST /api/scrape        -> trigger a scrape (blocks until complete)
// GET  /api/scrape/status -> check whether a scrape is currently running
router.post("/", triggerScrape);
router.post("/new", triggerNewTenderScrape);
router.get("/status", scrapeStatus);

export default router;
