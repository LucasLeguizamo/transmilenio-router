import { inventoryCacheDir } from "../croma/cache";
import {
	CROMA_LIST_PER_PAGE,
	EXPECTED_ROUTE_COUNT,
	EXPECTED_ROUTES_LIST_PAGES,
} from "../croma/paths";
import { ALL_SYSTEMS } from "./sync-constants";
import { loadSyncState, loadSnapshot } from "./store";

export type SyncEstimate = {
	strategy: "route_first";
	list_per_page: number;
	systems: number;
	/** Projected routes-search pages (cold). */
	routes_list_pages_projected: number;
	/** Projected route/v1 calls if none cached. */
	route_details_projected_cold: number;
	/** Fresh route/v1 entries already on disk. */
	route_details_cached_fresh: number;
	/** Network calls still needed for a resume/refresh. */
	route_details_remaining: number;
	/** Total projected network calls for this run. */
	total_projected: number;
	/** Cold full sync (ignore cache). */
	total_cold: number;
	/** Incremental refresh assuming all routes still fresh. */
	total_refresh_if_fresh: number;
	notes: string[];
	cache: { files: number; bytes: number; fresh_route_details: number };
	existing_snapshot_routes: number | null;
};

/**
 * Project Croma credit burn for network:sync without calling the API.
 *
 * Cold full sync (observed Bogotá sizes):
 *   routes-search ≈ 14 pages (7 systems × ~2 pages @ 100/page)
 *   route/v1      ≈ 1,045 (one per route; stops come from pattern embeds)
 *   Total         ≈ 1,060 network calls
 *
 * Refresh with warm dataset cache (TTL 7d): ≈ 0–14 calls (list only if stale).
 */
export function estimateSyncCalls(options?: {
	expectedRoutes?: number;
	expectedListPages?: number;
}): SyncEstimate {
	const expectedRoutes = options?.expectedRoutes ?? EXPECTED_ROUTE_COUNT;
	const expectedListPages =
		options?.expectedListPages ?? EXPECTED_ROUTES_LIST_PAGES;
	const cache = inventoryCacheDir();
	const snapshot = loadSnapshot();
	const state = loadSyncState();

	const knownRouteCount =
		snapshot?.counts.routes ??
		state?.route_ids.length ??
		expectedRoutes;

	const doneIds = new Set(state?.route_ids_done ?? []);
	const pendingFromState =
		state && state.route_ids.length > 0
			? state.route_ids.filter((id) => !doneIds.has(id)).length
			: null;

	const cachedFresh = cache.fresh_route_details;
	const routeDetailsRemaining =
		pendingFromState != null
			? pendingFromState
			: Math.max(0, knownRouteCount - cachedFresh);

	// List pages: if we already finished routes_list, 0 remaining.
	const listRemaining =
		state &&
		(state.phase === "routes_detail" ||
			state.phase === "build" ||
			state.phase === "done")
			? 0
			: expectedListPages;

	const notes: string[] = [
		"Stops are derived from route/v1 pattern embeds — no stops-search geo shards.",
		`List page size ${CROMA_LIST_PER_PAGE}; ${ALL_SYSTEMS.length} systems.`,
		"402 billing_error stops the run immediately (no retries); resume after credits reset.",
		"Cache hits (data/croma-cache) do not consume credits.",
	];

	if (cachedFresh > 0) {
		notes.push(
			`${cachedFresh} fresh route/v1 responses in local cache will be reused.`,
		);
	}
	if (snapshot) {
		notes.push(
			`Existing snapshot: ${snapshot.counts.stops} stops / ${snapshot.counts.routes} routes.`,
		);
	}

	const totalProjected = listRemaining + routeDetailsRemaining;
	const totalCold = expectedListPages + expectedRoutes;

	return {
		strategy: "route_first",
		list_per_page: CROMA_LIST_PER_PAGE,
		systems: ALL_SYSTEMS.length,
		routes_list_pages_projected: expectedListPages,
		route_details_projected_cold: expectedRoutes,
		route_details_cached_fresh: cachedFresh,
		route_details_remaining: routeDetailsRemaining,
		total_projected: totalProjected,
		total_cold: totalCold,
		total_refresh_if_fresh: expectedListPages, // re-list only; details cached
		notes,
		cache: {
			files: cache.files,
			bytes: cache.bytes,
			fresh_route_details: cache.fresh_route_details,
		},
		existing_snapshot_routes: snapshot?.counts.routes ?? null,
	};
}
