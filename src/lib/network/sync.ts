import type { CromaClient } from "../croma/client";
import type { Route, Stop, TransitSystem } from "../croma/types";
import { buildNetworkGraph } from "./build-graph";
import {
	clearSyncState,
	loadSyncState,
	saveGraph,
	saveSnapshot,
	saveSyncState,
} from "./store";
import {
	NETWORK_SNAPSHOT_VERSION,
	type NetworkRoute,
	type NetworkSnapshot,
	type NetworkStop,
	type SyncState,
} from "./types";

export const ALL_SYSTEMS: TransitSystem[] = [
	"troncal",
	"alimentador",
	"dual",
	"zonal_urbano",
	"zonal_complementario",
	"zonal_especial",
	"transmicable",
];

export type SyncOptions = {
	client: CromaClient;
	/** Delay between API calls (ms). Default 200. */
	rateMs?: number;
	/** Resume from sync-state.json when true (default). */
	resume?: boolean;
	dryRun?: boolean;
	/** Cap pages for dry-run / testing. */
	maxPages?: number;
	/** Cap route detail fetches for dry-run / testing. */
	maxRouteDetails?: number;
	onProgress?: (event: SyncProgressEvent) => void;
};

export type SyncProgressEvent = {
	phase: SyncState["phase"];
	message: string;
	counts?: {
		stops?: number;
		routes?: number;
		routeDetailsDone?: number;
		routeDetailsPending?: number;
	};
};

export type SyncResult = {
	success: boolean;
	dry_run: boolean;
	fetched_at?: string;
	counts?: NetworkSnapshot["counts"];
	paths?: { snapshot: string; graph: string };
	errors: string[];
	resumed: boolean;
	api_calls: number;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactStop(stop: Stop): NetworkStop {
	return {
		id: stop.stop_id,
		code: stop.code,
		name: stop.name,
		kind: stop.kind,
		lat: stop.latitude,
		lon: stop.longitude,
		parent: stop.parent_station,
		platforms: stop.platforms ?? [],
		systems: stop.systems ?? [],
		route_ids: stop.route_ids,
		route_codes: stop.route_codes,
	};
}

function compactRoute(route: Route): NetworkRoute {
	return {
		id: route.route_id,
		code: route.short_name,
		name: route.long_name,
		system: route.system,
		color: route.color,
		patterns: (route.patterns ?? []).map((pattern) => ({
			shape_id: pattern.shape_id ?? null,
			stops: pattern.stops.map((s) => ({
				id: s.stop_id,
				seq: s.sequence ?? 0,
				offset: s.offset_seconds ?? null,
				name: s.name,
				lat: s.latitude,
				lon: s.longitude,
			})),
		})),
	};
}

function emptyState(): SyncState {
	return {
		version: 1,
		updated_at: new Date().toISOString(),
		phase: "stops",
		stops_page: 1,
		routes_system_index: 0,
		routes_page: 1,
		route_ids: [],
		route_ids_done: [],
		stops: [],
		routes: [],
		as_of: null,
		errors: [],
	};
}

/**
 * Fetch the full TransMilenio/SITP network from Croma into a local snapshot + graph.
 * Idempotent and resumable via data/network/sync-state.json.
 *
 * Error examples:
 * - Missing CROMA_API_KEY → caller should fail before invoke
 * - HTTP 429 → backs off and retries; recorded in errors if exhausted
 * - Parse error on a route → skipped, listed in errors, sync continues
 */
export async function syncNetwork(options: SyncOptions): Promise<SyncResult> {
	const rateMs = options.rateMs ?? 200;
	const resume = options.resume !== false;
	const dryRun = options.dryRun === true;
	const maxPages = options.maxPages;
	const maxRouteDetails = options.maxRouteDetails;
	let apiCalls = 0;
	const errors: string[] = [];

	let state: SyncState =
		resume && loadSyncState() ? (loadSyncState() as SyncState) : emptyState();
	const resumed = state.phase !== "stops" || state.stops_page > 1 || state.stops.length > 0;

	if (!resume) {
		state = emptyState();
	}

	const progress = (message: string, counts?: SyncProgressEvent["counts"]) => {
		options.onProgress?.({ phase: state.phase, message, counts });
	};

	const throttle = async () => {
		if (rateMs > 0) await sleep(rateMs);
	};

	const persist = () => {
		state.updated_at = new Date().toISOString();
		if (!dryRun) saveSyncState(state);
	};

	const callApi = async <T extends { kind: string; status?: number; message?: string }>(
		label: string,
		fn: () => Promise<T>,
	): Promise<T | null> => {
		for (let attempt = 0; attempt < 4; attempt++) {
			apiCalls += 1;
			try {
				const result = await fn();
				if (
					result.kind === "error" &&
					result.status === 429 &&
					attempt < 3
				) {
					await sleep(rateMs * Math.pow(2, attempt + 2));
					continue;
				}
				return result;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (attempt === 3) {
					errors.push(`${label}: ${message}`);
					return null;
				}
				await sleep(rateMs * Math.pow(2, attempt + 1));
			}
		}
		return null;
	};

	// --- Phase: stops ---
	if (state.phase === "stops") {
		progress("Fetching stops pages");
		const stopIds = new Set(state.stops.map((s) => s.id));
		let page = state.stops_page;
		let totalPages = Number.POSITIVE_INFINITY;

		while (page <= totalPages) {
			if (maxPages != null && page > maxPages) break;
			await throttle();
			const result = await callApi(`stops-search page ${page}`, async () =>
				options.client.searchStops({ page, per_page: 100 }),
			);
			if (!result || result.kind === "error") {
				errors.push(
					`stops-search page ${page}: ${result && result.kind === "error" ? result.message : "failed"}`,
				);
				if (result && result.kind === "error" && result.status === 429) {
					await sleep(rateMs * 8);
					continue;
				}
				break;
			}

			state.as_of = result.data.data.as_of ?? state.as_of;
			totalPages = result.data.data.total_pages || 1;
			for (const stop of result.data.data.stops) {
				if (stopIds.has(stop.stop_id)) continue;
				stopIds.add(stop.stop_id);
				state.stops.push(compactStop(stop));
			}
			page += 1;
			state.stops_page = page;
			persist();
			progress(`Fetched stops page ${page - 1}/${totalPages}`, {
				stops: state.stops.length,
			});
		}

		state.phase = "routes_list";
		state.routes_system_index = 0;
		state.routes_page = 1;
		persist();
	}

	// --- Phase: routes list by system ---
	if (state.phase === "routes_list") {
		progress("Fetching route ids by system");
		const routeIdSet = new Set(state.route_ids);
		for (let si = state.routes_system_index; si < ALL_SYSTEMS.length; si++) {
			const system = ALL_SYSTEMS[si];
			let page = si === state.routes_system_index ? state.routes_page : 1;
			let totalPages = Number.POSITIVE_INFINITY;
			while (page <= totalPages) {
				if (maxPages != null && page > maxPages) break;
				await throttle();
				const result = await callApi(
					`routes-search ${system} page ${page}`,
					async () =>
						options.client.searchRoutes({
							system,
							page,
							per_page: 100,
						}),
				);
				if (!result || result.kind === "error") {
					errors.push(
						`routes-search ${system} p${page}: ${result && result.kind === "error" ? result.message : "failed"}`,
					);
					if (result && result.kind === "error" && result.status === 429) {
						await sleep(rateMs * 8);
						continue;
					}
					break;
				}
				state.as_of = result.data.data.as_of ?? state.as_of;
				totalPages = result.data.data.total_pages || 1;
				for (const route of result.data.data.routes) {
					if (!routeIdSet.has(route.route_id)) {
						routeIdSet.add(route.route_id);
						state.route_ids.push(route.route_id);
					}
				}
				page += 1;
				state.routes_system_index = si;
				state.routes_page = page;
				persist();
				progress(`Routes ${system} page ${page - 1}/${totalPages}`, {
					routes: state.route_ids.length,
				});
			}
			state.routes_system_index = si + 1;
			state.routes_page = 1;
			persist();
		}
		state.phase = "routes_detail";
		persist();
	}

	// --- Phase: route details (patterns) ---
	if (state.phase === "routes_detail") {
		progress("Fetching route patterns");
		const done = new Set(state.route_ids_done);
		const pending = state.route_ids.filter((id) => !done.has(id));
		let fetched = 0;
		for (const routeId of pending) {
			if (maxRouteDetails != null && fetched >= maxRouteDetails) break;
			await throttle();
			const result = await callApi(`route ${routeId}`, async () =>
				options.client.getRoute(routeId, false),
			);
			fetched += 1;
			if (!result || result.kind === "error") {
				errors.push(
					`route ${routeId}: ${result && result.kind === "error" ? result.message : "failed"}`,
				);
				if (result && result.kind === "error" && result.status === 429) {
					await sleep(rateMs * 8);
				}
				continue;
			}
			if (!result.data.data.route) {
				errors.push(`route ${routeId}: found=false`);
				done.add(routeId);
				state.route_ids_done = [...done];
				persist();
				continue;
			}
			state.routes.push(compactRoute(result.data.data.route));
			done.add(routeId);
			state.route_ids_done = [...done];
			persist();
			if (fetched % 25 === 0) {
				progress(`Route details ${done.size}/${state.route_ids.length}`, {
					routeDetailsDone: done.size,
					routeDetailsPending: state.route_ids.length - done.size,
				});
			}
		}
		state.phase = "build";
		persist();
	}

	// --- Phase: build snapshot + graph ---
	if (state.phase === "build") {
		progress("Building snapshot and graph");
		const patterns = state.routes.reduce(
			(n, r) => n + r.patterns.length,
			0,
		);
		const snapshot: NetworkSnapshot = {
			version: NETWORK_SNAPSHOT_VERSION,
			fetched_at: new Date().toISOString(),
			source: "croma",
			as_of: state.as_of,
			counts: {
				stops: state.stops.length,
				routes: state.routes.length,
				patterns,
			},
			stops: state.stops,
			routes: state.routes,
		};
		const graph = buildNetworkGraph(snapshot);

		if (dryRun) {
			state.phase = "done";
			return {
				success: errors.length === 0,
				dry_run: true,
				fetched_at: snapshot.fetched_at,
				counts: snapshot.counts,
				errors: [...errors, ...state.errors],
				resumed,
				api_calls: apiCalls,
			};
		}

		saveSnapshot(snapshot);
		saveGraph(graph);
		state.phase = "done";
		persist();
		clearSyncState();

		return {
			success: true,
			dry_run: false,
			fetched_at: snapshot.fetched_at,
			counts: snapshot.counts,
			paths: {
				snapshot: "data/network/snapshot.json",
				graph: "data/network/graph.json",
			},
			errors: [...errors, ...state.errors],
			resumed,
			api_calls: apiCalls,
		};
	}

	return {
		success: state.phase === "done",
		dry_run: dryRun,
		errors: [...errors, ...state.errors],
		resumed,
		api_calls: apiCalls,
	};
}
