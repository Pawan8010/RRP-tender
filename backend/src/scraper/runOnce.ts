import "../config/env";
import { runScrape } from "./scrapeRunner";
import { disconnectDb } from "../config/db";
import { logger } from "../utils/logger";

async function main() {
  const result = await runScrape();
  logger.info(`Scrape finished with status ${result.status}`);
  await disconnectDb();
  process.exit(result.status === "SUCCESS" ? 0 : 1);
}

main().catch((err) => {
  logger.error(`Fatal error running scrape: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
