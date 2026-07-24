import { config } from "../config/env";
import { RawScrapedTender } from "../types/scraper";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const GEM_LISTING_URL = "https://bidplus.gem.gov.in/all-bids";
const GEM_DATA_URL = "https://bidplus.gem.gov.in/all-bids-data";
const PAGE_SIZE = 10;

type GemBid = Record<string, unknown>;

async function requestText(
  url: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string } = {}
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gem-scrape-"));
  const headerPath = path.join(tempDir, "headers.txt");
  const bodyPath = path.join(tempDir, "body.txt");
  try {
    return await new Promise((resolve, reject) => {
      const curl = process.platform === "win32" ? "curl.exe" : "curl";
      const args = [
        "-sS",
        "-k",
        "-L",
        "--connect-timeout",
        String(Math.ceil(config.scraperTimeoutMs / 1000)),
        "--max-time",
        String(Math.ceil(config.scraperTimeoutMs / 1000)),
        "-D",
        headerPath,
        "-o",
        bodyPath,
        url,
      ];
      for (const [key, value] of Object.entries(options.headers ?? {})) {
        args.push("-H", `${key}: ${value}`);
      }
      if (options.method === "POST") {
        args.push("-X", "POST", "--data", options.body ?? "");
      }

      execFile(curl, args, { timeout: config.scraperTimeoutMs + 5000, maxBuffer: 20 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        void Promise.all([readFile(headerPath, "utf8"), readFile(bodyPath, "utf8")])
          .then(([rawHeaders, body]) => {
            const headerBlocks = rawHeaders.split(/\r?\n\r?\n/).filter((part) => part.startsWith("HTTP/"));
            const headerBlock = headerBlocks[headerBlocks.length - 1] ?? "";
            const lines = headerBlock.split(/\r?\n/);
            const statusCode = Number(lines[0]?.match(/HTTP\/\S+\s+(\d+)/)?.[1] ?? 0);
            const headers: Record<string, string | string[]> = {};
            for (const line of lines.slice(1)) {
              const index = line.indexOf(":");
              if (index <= 0) continue;
              const key = line.slice(0, index).trim().toLowerCase();
              const value = line.slice(index + 1).trim();
              if (headers[key]) {
                headers[key] = Array.isArray(headers[key]) ? [...headers[key], value] : [headers[key] as string, value];
              } else {
                headers[key] = value;
              }
            }
            resolve({ statusCode, headers, body });
          })
          .catch(reject);
      });
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function firstValue<T = unknown>(value: unknown): T | null {
  if (Array.isArray(value)) return value.length ? (value[0] as T) : null;
  return value === undefined || value === null ? null : (value as T);
}

function clean(value: unknown): string | null {
  const raw = firstValue(value);
  if (raw === null) return null;
  const text = String(raw).replace(/\s+/g, " ").trim();
  return text || null;
}

function csrfFromHtml(html: string): string {
  const match = html.match(/csrf_bd_gem_nk['"]?\s*[:=]\s*['"]([^'"]+)/);
  if (!match) throw new Error("Unable to read GeM CSRF token from all-bids page");
  return match[1];
}

function cookiesFromHeaders(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers["set-cookie"];
  const cookieHeaders = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookieHeaders
    .flatMap((header) => header.split(/,(?=\s*[^;,]+=)/))
    .map((cookie) => cookie.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function payload(page: number, sort = "Bid-End-Date-Oldest") {
  const data: Record<string, unknown> = {
    param: { searchBid: "", searchType: "fullText" },
    filter: {
      bidStatusType: "ongoing_bids",
      byType: "all",
      highBidValue: "",
      byEndDate: { from: "", to: "" },
      sort,
    },
  };
  if (page > 1) data.page = page;
  return data;
}

async function fetchFirstPageSession() {
  const response = await requestText(GEM_LISTING_URL, {
    headers: {
      "user-agent": config.scraperUserAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`GeM listing returned HTTP ${response.statusCode}`);
  }
  const html = response.body;
  return {
    csrf: csrfFromHtml(html),
    cookie: cookiesFromHeaders(response.headers),
  };
}

async function fetchGemDataPage(csrf: string, cookie: string, page: number, sort?: string) {
  const body = new URLSearchParams({
    payload: JSON.stringify(payload(page, sort)),
    csrf_bd_gem_nk: csrf,
  });

  const response = await requestText(GEM_DATA_URL, {
    method: "POST",
    headers: {
      "user-agent": config.scraperUserAgent,
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://bidplus.gem.gov.in",
      referer: GEM_LISTING_URL,
      "x-requested-with": "XMLHttpRequest",
      cookie,
      "content-length": Buffer.byteLength(body.toString()).toString(),
    },
    body: body.toString(),
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`GeM data page ${page} returned HTTP ${response.statusCode}: ${response.body.slice(0, 200)}`);
  }

  const json = JSON.parse(response.body) as any;
  if (json.code !== 200) throw new Error(`GeM rejected page ${page}: ${json.message ?? "unknown error"}`);
  return json.response.response as { numFound: number; start: number; docs: GemBid[] };
}

async function fetchGemDataPageWithRetry(csrf: string, cookie: string, page: number, sort?: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.scraperMaxRetries; attempt += 1) {
    try {
      return await fetchGemDataPage(csrf, cookie, page, sort);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function mapGemBid(bid: GemBid): RawScrapedTender | null {
  const tenderId = clean(bid.b_bid_number);
  const bidNumericId = clean(bid.b_id) ?? clean(bid.id);
  const title = clean(bid.b_category_name) ?? clean(bid.bd_category_name);
  if (!tenderId || !title) return null;

  const bidType = firstValue<number>(bid.b_bid_type);
  let documentPath = "showbidDocument";
  if (bidType === 5) documentPath = "showdirectradocumentPdf";
  if (bidType === 2) documentPath = "showradocumentPdf";
  const documentURL = bidNumericId ? `https://bidplus.gem.gov.in/${documentPath}/${bidNumericId}` : GEM_LISTING_URL;

  const ministry = clean(bid.ba_official_details_minName);
  const department = clean(bid.ba_official_details_deptName);
  const organisation = clean(bid.ba_official_details_orgName) ?? ministry ?? department;
  const quantity = clean(bid.b_total_quantity);

  return {
    tenderId,
    title,
    organisation,
    department: ministry ?? department,
    location: "India",
    state: null,
    category: "GeM Bid",
    description: [title, ministry, department, organisation, quantity ? `Quantity: ${quantity}` : null]
      .filter(Boolean)
      .join(" | "),
    estimatedValueText: clean(bid.b_total_value),
    publishedDateText: clean(bid.final_start_date_sort),
    closingDateText: clean(bid.final_end_date_sort),
    tenderURL: documentURL,
    documentURL,
    statusText: "LIVE",
  };
}

export interface GemApiScrapeOptions {
  maxPages?: number;
  sort?: string;
  startPage?: number;
}

export interface GemApiScrapeResult {
  tenders: RawScrapedTender[];
  pagesScraped: number;
  statedTotal: number;
  failedPages: number[];
  maxAvailablePages: number;
}

export async function scrapeGemApi(
  onPage?: (tenders: RawScrapedTender[], page: number, statedTotal: number) => Promise<void>,
  options: GemApiScrapeOptions = {}
): Promise<GemApiScrapeResult> {
  const { csrf, cookie } = await fetchFirstPageSession();
  const firstPage = await fetchGemDataPage(csrf, cookie, 1, options.sort);
  const statedTotal = Number(firstPage.numFound || 0);
  const maxAvailablePages = Math.max(1, Math.ceil(statedTotal / PAGE_SIZE));
  const configuredMaxPages = options.maxPages ?? config.scraperMaxPages;
  const maxPages = configuredMaxPages > 0 ? Math.min(configuredMaxPages, maxAvailablePages) : maxAvailablePages;
  const configuredStartPage = options.startPage ?? config.scraperStartPage;
  const startPage = Math.min(Math.max(1, configuredStartPage), maxPages);

  const tenders: RawScrapedTender[] = [];
  let pagesScraped = 0;

  const handlePage = async (page: number, pageData: { docs: GemBid[] }) => {
    pagesScraped = Math.max(pagesScraped, page);
    const mapped = (pageData.docs || []).map(mapGemBid).filter((item): item is RawScrapedTender => Boolean(item));
    tenders.push(...mapped);
    if (onPage) await onPage(mapped, page, statedTotal);
    return mapped.length;
  };

  if (startPage <= 1) {
    await handlePage(1, firstPage);
  }

  const concurrency = Math.max(1, config.scraperApiConcurrency);
  let nextPage = Math.max(2, startPage);
  let emptyPageSeen = false;
  const failedPages: number[] = [];

  async function worker() {
    while (!emptyPageSeen) {
      const page = nextPage;
      nextPage += 1;
      if (page > maxPages) return;
      try {
        const pageData = await fetchGemDataPageWithRetry(csrf, cookie, page, options.sort);
        const count = await handlePage(page, pageData);
        if (count === 0) emptyPageSeen = true;
      } catch {
        failedPages.push(page);
      }
      if (config.scraperRequestDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.scraperRequestDelayMs));
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  for (const page of failedPages) {
    try {
      const pageData = await fetchGemDataPageWithRetry(csrf, cookie, page, options.sort);
      await handlePage(page, pageData);
    } catch {
      // Keep the scrape moving; the next "new tender" scrape can fill occasional missed pages.
    }
  }

  return { tenders, pagesScraped, statedTotal, failedPages, maxAvailablePages };
}
