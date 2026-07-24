import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import { config } from "./config/env";
import { logger } from "./utils/logger";
import { connectDb, disconnectDb } from "./config/db";
import tenderRoutes from "./routes/tenders";
import scrapeRoutes from "./routes/scrape";
import crawlRoutes from "./routes/crawl";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { startScheduler } from "./scraper/scheduler";
import { markInterruptedScrapes } from "./scraper/scrapeRunner";

async function main() {
  await connectDb();
  logger.info("Connected to PostgreSQL");
  await markInterruptedScrapes();

  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(compression());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  // Generous limit since search is meant to feel instant while typing.
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api", apiLimiter);

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.use("/api/tenders", tenderRoutes);
  app.use("/api/scrape", scrapeRoutes);
  app.use("/api/crawl", crawlRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(config.port, () => {
    logger.info(`GeM Tender Intelligence API listening on port ${config.port}`);
  });

  startScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error(`Failed to start server: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
