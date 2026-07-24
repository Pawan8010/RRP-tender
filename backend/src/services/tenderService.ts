import { Prisma, TenderStatus } from "@prisma/client";
import { prisma } from "../config/db";
import { logger } from "../utils/logger";
import { RawScrapedTender } from "../types/scraper";
import { mapRawTenderToUpsertData } from "../scraper/mapper";

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
  rawTenders: RawScrapedTender[]
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const raw of rawTenders) {
    const data = mapRawTenderToUpsertData(raw);

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
  const where: Prisma.TenderWhereInput = {};

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

function buildTextSearchWhere(searchTerm: string): Prisma.TenderWhereInput {
  const mode = "insensitive" as const;
  return {
    OR: [
      { tenderId: { contains: searchTerm, mode } },
      { title: { contains: searchTerm, mode } },
      { organisation: { contains: searchTerm, mode } },
      { department: { contains: searchTerm, mode } },
      { state: { contains: searchTerm, mode } },
      { category: { contains: searchTerm, mode } },
      { keywordMatched: { contains: searchTerm, mode } },
      { description: { contains: searchTerm, mode } },
    ],
  };
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
    const combinedWhere: Prisma.TenderWhereInput = {
      AND: [where, buildTextSearchWhere(searchTerm)],
    };

    const [data, totalItems] = await Promise.all([
      prisma.tender.findMany({
        where: combinedWhere,
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.tender.count({ where: combinedWhere }),
    ]);

    return paginate(data, page, pageSize, totalItems);
  }

  const [data, totalItems] = await Promise.all([
    prisma.tender.findMany({ where, orderBy, skip, take: pageSize }),
    prisma.tender.count({ where }),
  ]);

  return paginate(data, page, pageSize, totalItems);
}

function paginate<T>(data: T[], page: number, pageSize: number, totalItems: number) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
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

  const [totalTenders, newToday, closingSoon, keywordMatches] = await Promise.all([
    prisma.tender.count(),
    prisma.tender.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.tender.count({
      where: { closingDate: { gte: new Date(), lte: in7Days } },
    }),
    prisma.tender.count({ where: { keywordMatched: { not: null } } }),
  ]);

  return { totalTenders, newToday, closingSoon, keywordMatches };
}
