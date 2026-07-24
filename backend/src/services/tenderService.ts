import { Prisma, TenderStatus } from "@prisma/client";
import { prisma } from "../config/db";
import { logger } from "../utils/logger";
import { RawScrapedTender } from "../types/scraper";
import { mapRawTenderToUpsertData } from "../scraper/mapper";
import { KEYWORDS } from "../scraper/keywords";
import { scrapeGemApi } from "../scraper/gemApiScraper";

export interface TenderQuery {
  q?: string;
  state?: string;
  department?: string;
  organisation?: string;
  category?: string;
  keyword?: string;
  portal?: string;
  status?: TenderStatus;
  minValue?: number;
  maxValue?: number;
  publishedAfter?: string;
  publishedBefore?: string;
  closingAfter?: string;
  closingBefore?: string;
  sort?:
    | "newest"
    | "oldest"
    | "closing_soon"
    | "highest_value"
    | "lowest_value"
    | "recently_updated";
  page?: number;
  pageSize?: number;
}

/**
 * Upserts a batch of raw scraped tenders. Dedup key is `tenderId`.
 * Returns counts of how many were newly inserted vs updated.
 */
export async function upsertScrapedTenders(
  rawTenders: RawScrapedTender[],
  scrapeRunId?: string
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const raw of rawTenders) {
    const data = {
      ...mapRawTenderToUpsertData(raw),
      lastSeenAt: new Date(),
      lastSeenRunId: scrapeRunId ?? null,
    };

    const existing = await prisma.tender.findUnique({
      where: { tenderId: raw.tenderId },
      select: { id: true },
    });

    await prisma.tender.upsert({
      where: { tenderId: raw.tenderId },
      create: data,
      update: data,
    });

    if (existing) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  logger.info(`[tenderService] Upsert complete: ${inserted} inserted, ${updated} updated`);
  return { inserted, updated };
}

/** Builds the Prisma WHERE clause for structured filters (everything except free-text `q`). */
function buildWhere(query: TenderQuery): Prisma.TenderWhereInput {
  const where: Prisma.TenderWhereInput = {
    tenderStatus: query.status ?? TenderStatus.LIVE,
  };

  if (query.state) where.state = { equals: query.state, mode: "insensitive" };
  if (query.department) where.department = { equals: query.department, mode: "insensitive" };
  if (query.organisation) where.organisation = { equals: query.organisation, mode: "insensitive" };
  if (query.category) where.category = { equals: query.category, mode: "insensitive" };
  if (query.portal) where.portal = { equals: query.portal, mode: "insensitive" };
  if (query.status) where.tenderStatus = query.status;
  if (query.keyword) where.keywordMatched = { contains: query.keyword, mode: "insensitive" };

  if (query.minValue !== undefined || query.maxValue !== undefined) {
    where.estimatedValue = {
      ...(query.minValue !== undefined ? { gte: new Prisma.Decimal(query.minValue) } : {}),
      ...(query.maxValue !== undefined ? { lte: new Prisma.Decimal(query.maxValue) } : {}),
    };
  }

  if (query.publishedAfter || query.publishedBefore) {
    where.publishedDate = {
      ...(query.publishedAfter ? { gte: new Date(query.publishedAfter) } : {}),
      ...(query.publishedBefore ? { lte: new Date(query.publishedBefore) } : {}),
    };
  }

  if (query.closingAfter || query.closingBefore) {
    where.closingDate = {
      ...(query.closingAfter ? { gte: new Date(query.closingAfter) } : {}),
      ...(query.closingBefore ? { lte: new Date(query.closingBefore) } : {}),
    };
  }

  return where;
}

function buildOrderBy(sort?: TenderQuery["sort"]): Prisma.TenderOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return { publishedDate: "asc" };
    case "closing_soon":
      return { closingDate: "asc" };
    case "highest_value":
      return { estimatedValue: "desc" };
    case "lowest_value":
      return { estimatedValue: "asc" };
    case "recently_updated":
      return { updatedAt: "desc" };
    case "newest":
    default:
      return { publishedDate: "desc" };
  }
}

const SEARCH_CORRECTIONS: Record<string, string> = {
  slight: "sight",
  site: "sight",
  sigth: "sight",
  singht: "sight",
  lrf: "laser range finder",
  nvd: "night vision device",
  nvg: "night vision goggles",
  eoss: "electro optical surveillance system",
  loros: "long range observation system",
  ptz: "pan tilt zoom camera",
  eo: "electro optical",
};
const SEARCH_STOP_WORDS = new Set([
  "and",
  "for",
  "from",
  "with",
  "the",
  "this",
  "that",
  "system",
  "systems",
  "service",
  "services",
  "repair",
  "supply",
  "installation",
  "long",
  "range",
]);
const ACRONYM_TERMS = new Set(["lrf", "nvd", "nvg", "eoss", "loros", "ptz", "eo", "lwir", "mwir"]);
const EQUIPMENT_FAMILY_TERMS = new Set(["sight", "camera", "surveillance", "thermal", "vision"]);
const GEM_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const gemSearchCache = new Map<string, { expiresAt: number; tenderIds: string[]; statedTotal: number; scrapedAt: Date }>();

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function expandSearchParts(searchTerm: string): { phrases: string[]; tokens: string[]; relatedKeywords: string[] } {
  const normalized = searchTerm.toLowerCase().replace(/[^\w\s/+-]/g, " ").replace(/\s+/g, " ").trim();
  const rawWords = normalized.split(" ").filter(Boolean);
  const hasSightTypo = rawWords.some((word) => ["slight", "site", "sigth", "singht"].includes(word));
  const isAcronymOnly = rawWords.length === 1 && ACRONYM_TERMS.has(rawWords[0]);
  const correctedWords = rawWords.map((word) => SEARCH_CORRECTIONS[word] ?? word);
  const correctedPhrase = correctedWords.join(" ");
  const isSingleEquipmentFamilyTerm = correctedWords.length === 1 && EQUIPMENT_FAMILY_TERMS.has(correctedWords[0]);
  const tokenSource = hasSightTypo ? ["sight"] : isAcronymOnly ? rawWords : correctedPhrase.split(/\s+/);
  const tokens = unique(tokenSource.filter((token) => token.length >= 3 && !SEARCH_STOP_WORDS.has(token)));
  const relatedKeywords = KEYWORDS.filter((keyword) => {
    const key = keyword.toLowerCase();
    if (tokens.length > 1) {
      return tokens.every((token) => key.includes(token)) || key.includes(correctedPhrase) || correctedPhrase.includes(key);
    }
    return tokens.some((token) => key.includes(token)) || key.includes(correctedPhrase) || correctedPhrase.includes(key);
  });

  if (tokens.length === 1 && tokens.includes("sight")) {
    relatedKeywords.push(...KEYWORDS.filter((keyword) => keyword.toLowerCase().includes("sight")));
  }
  if (tokens.length === 1 && tokens.includes("thermal")) {
    relatedKeywords.push(...KEYWORDS.filter((keyword) => keyword.toLowerCase().includes("thermal")));
  }
  if (tokens.length === 1 && tokens.includes("camera")) {
    relatedKeywords.push(...KEYWORDS.filter((keyword) => keyword.toLowerCase().includes("camera")));
  }
  if (tokens.length === 1 && tokens.includes("surveillance")) {
    relatedKeywords.push(...KEYWORDS.filter((keyword) => keyword.toLowerCase().includes("surveillance")));
  }

  return {
    phrases: isSingleEquipmentFamilyTerm
      ? []
      : unique([searchTerm, normalized, correctedPhrase]).filter((phrase) => phrase.length >= 3),
    tokens,
    relatedKeywords: unique(relatedKeywords).slice(0, 30),
  };
}

function normalizeGemSearchTerm(searchTerm: string): string {
  return searchTerm.replace(/\s+/g, " ").trim();
}

function splitLiveSearchTerms(searchTerm: string): string[] {
  const terms = searchTerm.split("||").map(normalizeGemSearchTerm).filter((term) => term.length > 0);
  const expanded = terms.flatMap((term) => {
    const corrected = expandSearchParts(term).phrases
      .map(normalizeGemSearchTerm)
      .filter((phrase) => phrase.length > 0);
    return [term, ...corrected];
  });
  return unique(expanded);
}

async function syncGemSearchResults(searchTerm: string) {
  const normalized = normalizeGemSearchTerm(searchTerm);
  const cacheKey = normalized.toLowerCase();
  const cached = gemSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  logger.info(`[tenderService] Syncing live GeM search results for "${normalized}"`);
  const seenTenderIds = new Set<string>();
  const orderedTenderIds: string[] = [];
  const result = await scrapeGemApi(
    async (pageTenders) => {
      const uniquePage = pageTenders.filter((tender) => {
        if (seenTenderIds.has(tender.tenderId)) return false;
        seenTenderIds.add(tender.tenderId);
        orderedTenderIds.push(tender.tenderId);
        return true;
      });
      if (uniquePage.length > 0) {
        await upsertScrapedTenders(uniquePage);
      }
    },
    {
      searchTerm: normalized,
      sort: "Bid-End-Date-Oldest",
      startPage: 1,
      maxPages: 0,
    }
  );

  const value = {
    expiresAt: Date.now() + GEM_SEARCH_CACHE_TTL_MS,
    tenderIds: orderedTenderIds,
    statedTotal: result.statedTotal,
    scrapedAt: new Date(),
  };
  gemSearchCache.set(cacheKey, value);
  logger.info(
    `[tenderService] GeM search synced for "${normalized}": statedTotal=${result.statedTotal}, unique=${orderedTenderIds.length}, failedPages=${result.failedPages.length}`
  );
  return value;
}

/**
 * Searches and filters tenders. Free-text `q` uses broad case-insensitive
 * matching across bid number, title, buyer/department, category, keyword tags,
 * and description so partial searches return all related stored GeM tenders.
 */
export async function searchTenders(query: TenderQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where = buildWhere(query);
  const orderBy = buildOrderBy(query.sort);

  if (query.q && query.q.trim().length > 0) {
    const searchTerm = query.q.trim();
    const liveTerms = splitLiveSearchTerms(searchTerm);
    const liveSearches = await Promise.all(liveTerms.map(syncGemSearchResults));
    const mergedTenderIds = unique(liveSearches.flatMap((result) => result.tenderIds));
    const statedTotal = liveSearches.length === 1 ? liveSearches[0].statedTotal : mergedTenderIds.length;
    const pageTenderIds = mergedTenderIds.slice(skip, skip + pageSize);
    const orderIndex = new Map(pageTenderIds.map((tenderId, index) => [tenderId, index]));

    const data = pageTenderIds.length
      ? await prisma.tender.findMany({
          where: { AND: [where, { tenderId: { in: pageTenderIds } }] },
        })
      : [];

    data.sort((left, right) => (orderIndex.get(left.tenderId) ?? 0) - (orderIndex.get(right.tenderId) ?? 0));

    return paginate(data, page, pageSize, statedTotal, {
      source: liveTerms.length > 1 ? "live-gem-multi" : "live-gem",
      gemStatedTotal: statedTotal,
      gemUniqueStored: mergedTenderIds.length,
      gemSearchedAt: new Date(Math.max(...liveSearches.map((result) => result.scrapedAt.getTime()))).toISOString(),
      gemSearchTerms: liveTerms,
    });
  }

  const [data, totalItems] = await Promise.all([
    prisma.tender.findMany({ where, orderBy, skip, take: pageSize }),
    prisma.tender.count({ where }),
  ]);

  return paginate(data, page, pageSize, totalItems);
}

function paginate<T>(data: T[], page: number, pageSize: number, totalItems: number, meta?: Record<string, unknown>) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
    meta,
  };
}

export async function getTenderById(id: string) {
  return prisma.tender.findUnique({ where: { id } });
}

export async function getTenderStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);

  const [totalTenders, newToday, closingSoon, keywordMatches, latestRun] = await Promise.all([
    prisma.tender.count({ where: { tenderStatus: TenderStatus.LIVE } }),
    prisma.tender.count({ where: { tenderStatus: TenderStatus.LIVE, createdAt: { gte: startOfToday } } }),
    prisma.tender.count({
      where: { tenderStatus: TenderStatus.LIVE, closingDate: { gte: new Date(), lte: in7Days } },
    }),
    prisma.tender.count({ where: { tenderStatus: TenderStatus.LIVE, keywordMatched: { not: null } } }),
    prisma.scrapeRun.findFirst({ where: { status: "SUCCESS" }, orderBy: { startedAt: "desc" } }),
  ]);

  const statedTotalMatch = latestRun?.errorMessage?.match(/GeM stated total:\s*(\d+)/i);
  const gemListedTotal = statedTotalMatch ? Number(statedTotalMatch[1]) : totalTenders;

  return {
    totalTenders,
    gemListedTotal,
    duplicateOrUnmappedListings: Math.max(0, gemListedTotal - totalTenders),
    newToday,
    closingSoon,
    keywordMatches,
  };
}
