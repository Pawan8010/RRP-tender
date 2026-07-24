import { Router } from "express";
import {
  listTenders,
  searchTendersHandler,
  getTender,
  getStats,
  getRecentTenders,
  getBuyers,
  getCategories,
} from "../controllers/tenderController";

const router = Router();

// GET /api/tenders            -> paginated list with optional filters/sort
// GET /api/tenders/search      -> free-text search (q) + filters/sort (same handler, kept
//                                  as a distinct route to match the spec's API surface)
// GET /api/tenders/stats       -> dashboard stats cards
// GET /api/tenders/:id         -> single tender detail
router.get("/stats", getStats);
router.get("/search", searchTendersHandler);
router.get("/recent", getRecentTenders);
router.get("/buyers", getBuyers);
router.get("/categories", getCategories);
router.get("/:id", getTender);
router.get("/", listTenders);

export default router;
