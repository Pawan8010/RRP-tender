import cron from "node-cron";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { runScrape, isScrapeInProgress } from "./scrapeRunner";

export function startScheduler(): void {
  if (!config.scrapeCron) {
    logger.info("[scheduler] SCRAPE_CRON not set - automatic scheduling disabled");
    return;
  }

  if (!cron.validate(config.scrapeCron)) {
    logger.warn(`[scheduler] Invalid SCRAPE_CRON expression "${config.scrapeCron}" - scheduling disabled`);
    return;
  }

  cron.schedule(config.scrapeCron, async () => {
    if (isScrapeInProgress()) {
      logger.info("[scheduler] Skipping scheduled scrape - one is already running");
      return;
    }
    logger.info("[scheduler] Kicking off scheduled scrape");
    try {
      await runScrape();
    } catch (err) {
      logger.error(`[scheduler] Scheduled scrape failed: ${err instanceof Error ? err.message : err}`);
    }
  });

  logger.info(`[scheduler] Scheduled scraping enabled with cron "${config.scrapeCron}"`);
}
