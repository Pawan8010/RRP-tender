import dotenv from "dotenv";
dotenv.config({ override: true });

function requireEnv(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: requireEnv("DATABASE_URL"),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
  scrapeCron: process.env.SCRAPE_CRON ?? "",
  gemBaseUrl: process.env.GEM_BASE_URL ?? "https://mkp.gem.gov.in",
  scraperHeadless: (process.env.SCRAPER_HEADLESS ?? "true") === "true",
  scraperConcurrency: parseInt(process.env.SCRAPER_CONCURRENCY ?? "2", 10),
  scraperMaxRetries: parseInt(process.env.SCRAPER_MAX_RETRIES ?? "3", 10),
  scraperTimeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS ?? "45000", 10),
  scraperMaxPages: parseInt(process.env.SCRAPER_MAX_PAGES ?? "2", 10),
  newTenderMaxPages: parseInt(process.env.NEW_TENDER_MAX_PAGES ?? "75", 10),
  scraperRequestDelayMs: parseInt(process.env.SCRAPER_REQUEST_DELAY_MS ?? "200", 10),
  scraperApiConcurrency: parseInt(process.env.SCRAPER_API_CONCURRENCY ?? "12", 10),
  scraperStartPage: parseInt(process.env.SCRAPER_START_PAGE ?? "1", 10),
  scraperUserAgent:
    process.env.SCRAPER_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
