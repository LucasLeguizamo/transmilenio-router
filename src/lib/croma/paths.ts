import { join } from "path";

/** Local Croma HTTP cache + ledger (gitignored; not for redistribution). */
export const CROMA_CACHE_DIR = join(process.cwd(), "data", "croma-cache");
export const CROMA_RESPONSES_DIR = join(CROMA_CACHE_DIR, "responses");
export const CROMA_LEDGER_PATH = join(CROMA_CACHE_DIR, "ledger.jsonl");

/** Dataset endpoints (stops/routes) — long TTL; safe to reuse across sync resumes. */
export const DATASET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Live endpoints — short TTL for arrivals / alerts / vehicles. */
export const LIVE_TTL_MS = 60 * 1000;
export const ALERTS_TTL_MS = 5 * 60 * 1000;

/** Default hard budget for a sync run (cold full sync ≈ 1,060–1,100). */
export const DEFAULT_SYNC_MAX_CALLS = 1200;

/** Max list page size used for routes-search / stops-search. */
export const CROMA_LIST_PER_PAGE = 100;

/**
 * Expected Bogotá network sizes (from live sync observations).
 * Used by --estimate when no prior inventory exists.
 */
export const EXPECTED_ROUTE_COUNT = 1045;
export const EXPECTED_ROUTES_LIST_PAGES = 14;
