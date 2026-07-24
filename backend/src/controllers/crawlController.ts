import { ChildProcess, spawn } from "child_process";
import { Request, Response } from "express";
import { logger } from "../utils/logger";

let crawlProcess: ChildProcess | null = null;

export function triggerCrawlStart(req: Request, res: Response) {
  if (crawlProcess) {
    res.status(409).json({ error: "Crawl is already in progress" });
    return;
  }

  logger.info("[crawlController] Starting Python crawl process...");
  
  const maxPages = req.body.maxPages ? String(req.body.maxPages) : "2";
  const childEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:8010@localhost:5432/tender_db"
  };

  // Run in project workspace scraper directory
  crawlProcess = spawn("python", ["main.py", "--max-pages", maxPages], {
    cwd: "./scraper", // Relative to backend workspace root
    env: childEnv,
  });

  crawlProcess.stdout?.on("data", (data) => {
    logger.info(`[python scraper stdout] ${data.toString().trim()}`);
  });

  crawlProcess.stderr?.on("data", (data) => {
    logger.error(`[python scraper stderr] ${data.toString().trim()}`);
  });

  crawlProcess.on("close", (code) => {
    logger.info(`[crawlController] Python crawl process exited with code ${code}`);
    crawlProcess = null;
  });

  res.json({ message: "Crawl started successfully in the background" });
}

export function triggerCrawlStop(req: Request, res: Response) {
  if (!crawlProcess) {
    res.status(400).json({ error: "No crawl in progress" });
    return;
  }

  logger.info("[crawlController] Terminating Python crawl process...");
  crawlProcess.kill("SIGINT");
  
  const currentProcess = crawlProcess;
  setTimeout(() => {
    if (crawlProcess === currentProcess) {
      logger.warn("[crawlController] Python crawl process refused SIGINT, issuing SIGKILL...");
      crawlProcess.kill("SIGKILL");
      crawlProcess = null;
    }
  }, 5000);

  res.json({ message: "Crawl stop command sent" });
}

export function getCrawlStatus(req: Request, res: Response) {
  res.json({ inProgress: crawlProcess !== null });
}
