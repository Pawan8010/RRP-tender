import { prisma } from "../config/db";
import { logger } from "../utils/logger";
import { scrapeGemApi } from "./gemApiScraper";
import { upsertScrapedTenders } from "../services/tenderService";
import { TenderStatus } from "@prisma/client";

let scrapeInProgress = false;

export interface ScrapeResult {
  runId: string;
  status: "SUCCESS" | "FAILED";
  pagesScraped: number;
  tendersFound: number;
  tendersNew: number;
  tendersUpdated: number;
  statedTotal?: number;
}

export interface RunScrapeOptions {
  maxPages?: number;
  sort?: string;
  startPage?: number;
  label?: string;
}

export async function runScrape(options: RunScrapeOptions = {}): Promise<ScrapeResult> {
  if (scrapeInProgress) {
    throw new Error("A scrape is already in progress. Try again once it completes.");
  }

  scrapeInProgress = true;
  const run = await prisma.scrapeRun.create({ data: { status: "RUNNING" } });

  try {
    logger.info(`[scrapeRunner] Starting GeM public API scrape${options.label ? ` (${options.label})` : ""}`);
    let tendersFound = 0;
    let tendersNew = 0;
    let tendersUpdated = 0;
    const seenTenderIds = new Set<string>();
    const scraped = await scrapeGemApi(async (pageTenders, page, statedTotal) => {
      const uniquePage = pageTenders.filter((tender) => {
        if (seenTenderIds.has(tender.tenderId)) return false;
        seenTenderIds.add(tender.tenderId);
        return true;
      });
      const counts = await upsertScrapedTenders(uniquePage, run.id);
      tendersFound += uniquePage.length;
      tendersNew += counts.inserted;
      tendersUpdated += counts.updated;
      await prisma.scrapeRun.update({
        where: { id: run.id },
        data: {
          pagesScraped: page,
          tendersFound,
          tendersNew,
          tendersUpdated,
          errorMessage: `In progress. GeM stated total: ${statedTotal}`,
        },
      });
    }, { maxPages: options.maxPages, sort: options.sort, startPage: options.startPage });

    const isFullCurrentGeMScrape = !options.maxPages && (options.startPage ?? 1) <= 1;
    const closeStale = isFullCurrentGeMScrape && scraped.failedPages.length === 0;
    let staleClosed = 0;

    if (closeStale) {
      const result = await prisma.tender.updateMany({
        where: {
          portal: "GeM",
          tenderStatus: TenderStatus.LIVE,
          OR: [{ lastSeenRunId: { not: run.id } }, { lastSeenRunId: null }],
        },
        data: {
          tenderStatus: TenderStatus.CLOSED,
          lastUpdated: new Date(),
        },
      });
      staleClosed = result.count;
    }

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        pagesScraped: scraped.pagesScraped,
        tendersFound,
        tendersNew,
        tendersUpdated,
        errorMessage: `GeM stated total: ${scraped.statedTotal}; stale closed: ${staleClosed}; failed pages: ${scraped.failedPages.length}`,
      },
    });

    logger.info(
      `[scrapeRunner] Completed: pages=${scraped.pagesScraped}/${scraped.maxAvailablePages}, found=${tendersFound}, new=${tendersNew}, updated=${tendersUpdated}, staleClosed=${staleClosed}, failedPages=${scraped.failedPages.length}, statedTotal=${scraped.statedTotal}`
    );

    return {
      runId: run.id,
      status: "SUCCESS",
      pagesScraped: scraped.pagesScraped,
      tendersFound,
      tendersNew,
      tendersUpdated,
      statedTotal: scraped.statedTotal,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    logger.error(`[scrapeRunner] Failed: ${message}`);
    return {
      runId: run.id,
      status: "FAILED",
      pagesScraped: 0,
      tendersFound: 0,
      tendersNew: 0,
      tendersUpdated: 0,
    };
  } finally {
    scrapeInProgress = false;
  }
}

export function isScrapeInProgress(): boolean {
  return scrapeInProgress;
}
