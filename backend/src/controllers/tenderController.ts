import { Request, Response, NextFunction } from "express";
import { TenderStatus } from "@prisma/client";
import { prisma } from "../config/db";
import { searchTenders, getTenderById, getTenderStats, TenderQuery } from "../services/tenderService";

function parseQuery(req: Request): TenderQuery {
  const q = req.query;
  return {
    q: typeof q.q === "string" ? q.q : undefined,
    state: typeof q.state === "string" ? q.state : undefined,
    department: typeof q.department === "string" ? q.department : undefined,
    organisation: typeof q.organisation === "string" ? q.organisation : undefined,
    category: typeof q.category === "string" ? q.category : undefined,
    keyword: typeof q.keyword === "string" ? q.keyword : undefined,
    portal: typeof q.portal === "string" ? q.portal : undefined,
    status: typeof q.status === "string" ? (q.status as TenderStatus) : undefined,
    minValue: q.minValue ? Number(q.minValue) : undefined,
    maxValue: q.maxValue ? Number(q.maxValue) : undefined,
    publishedAfter: typeof q.publishedAfter === "string" ? q.publishedAfter : undefined,
    publishedBefore: typeof q.publishedBefore === "string" ? q.publishedBefore : undefined,
    closingAfter: typeof q.closingAfter === "string" ? q.closingAfter : undefined,
    closingBefore: typeof q.closingBefore === "string" ? q.closingBefore : undefined,
    sort: typeof q.sort === "string" ? (q.sort as TenderQuery["sort"]) : undefined,
    page: q.page ? Number(q.page) : undefined,
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  };
}

export async function listTenders(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await searchTenders(parseQuery(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** Same handler as listTenders - `q` in the query string drives full text search either way. */
export async function searchTendersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await searchTenders(parseQuery(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTender(req: Request, res: Response, next: NextFunction) {
  try {
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.id },
      include: {
        buyer: true,
        locationRel: true,
        financial: true,
        eligibility: true,
        products: true,
        attachments: true,
        updates: true,
      }
    });
    if (!tender) {
      res.status(404).json({ error: "Tender not found" });
      return;
    }
    res.json(tender);
  } catch (err) {
    next(err);
  }
}

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getTenderStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

export async function getRecentTenders(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 10;
    const skip = (page - 1) * pageSize;
    const data = await prisma.tender.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        buyer: true,
        locationRel: true,
        financial: true,
        eligibility: true,
        products: true,
        attachments: true,
      }
    });
    const totalItems = await prisma.tender.count();
    res.json({
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getBuyers(req: Request, res: Response, next: NextFunction) {
  try {
    const buyers = await prisma.buyer.findMany({
      orderBy: { name: "asc" }
    });
    res.json(buyers);
  } catch (err) {
    next(err);
  }
}

export async function getCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const tenders = await prisma.tender.findMany({
      select: { category: true },
      distinct: ["category"],
      where: { category: { not: null } }
    });
    const categories = tenders.map(t => t.category).filter(Boolean);
    res.json(categories);
  } catch (err) {
    next(err);
  }
}
