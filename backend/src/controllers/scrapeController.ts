import { Request, Response, NextFunction } from "express";
import { runScrape, isScrapeInProgress } from "../scraper/scrapeRunner";
import { logger } from "../utils/logger";
import { config } from "../config/env";

/**
 * POST /api/scrape
 * Triggers a full scrape synchronously and returns the result once done.
 * Since a full scrape can take a while, clients may prefer to fire-and-poll;
 * we still return the completed result here for simplicity, guarded by the
 * in-progress lock so concurrent triggers don't double-run.
 */
export async function triggerScrape(req: Request, res: Response, next: NextFunction) {
  if (isScrapeInProgress()) {
    res.status(409).json({ error: "A scrape is already in progress" });
    return;
  }

  try {
    logger.info("[scrapeController] Scrape triggered via API");
    void runScrape().catch((err) => {
      logger.error(`[scrapeController] Background scrape failed: ${err instanceof Error ? err.message : err}`);
    });
    res.status(202).json({ status: "STARTED" });
  } catch (err) {
    next(err);
  }
}

export async function triggerNewTenderScrape(req: Request, res: Response, next: NextFunction) {
  if (isScrapeInProgress()) {
    res.status(409).json({ error: "A scrape is already in progress" });
    return;
  }

  try {
    logger.info("[scrapeController] New tender scrape triggered via API");
    void runScrape({
      label: "new-tenders",
      maxPages: config.newTenderMaxPages,
      startPage: 1,
      sort: "Bid-Start-Date-Latest",
    }).catch((err) => {
      logger.error(`[scrapeController] Background new tender scrape failed: ${err instanceof Error ? err.message : err}`);
    });
    res.status(202).json({ status: "STARTED", mode: "NEW_TENDERS" });
  } catch (err) {
    next(err);
  }
}

export async function scrapeStatus(req: Request, res: Response) {
  res.json({ inProgress: isScrapeInProgress() });
}
