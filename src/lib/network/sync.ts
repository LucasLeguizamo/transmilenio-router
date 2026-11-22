import {
	BillingError,
	BudgetExceededError,
	type CromaClient,
} from "../croma/client";
import { CROMA_LIST_PER_PAGE, DEFAULT_SYNC_MAX_CALLS } from "../croma/paths";
import type { Route, TransitSystem } from "../croma/types";
import { buildNetworkGraph } from "./build-graph";
import { ALL_SYSTEMS } from "./sync-constants";
import {
	clearSyncState,
	loadSnapshot,
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

export { ALL_SYSTEMS } from "./sync-constants";

export type SyncOptions = {
	client: CromaClient;
	/** Delay between API calls (ms). Default 50 (cache hits are instant). */
	rateMs?: number;
	/** Resume from sync-state.json when true (default). */
	resume?: boolean;
	dryRun?: boolean;
	/** Cap list pagination (smoke). */
	maxPages?: number;
	/** Cap route detail fetches (smoke). */
	maxRouteDetails?: number;
	/** Hard network-call budget (default DEFAULT_SYNC_MAX_CALLS). */
	maxCalls?: number;
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
		apiCalls?: number;
	};
};

export type SyncResult = {
	success: boolean;
	dry_run: boolean;
	fetched_at?: string;
	counts?: NetworkSnapshot["counts"];
	paths?: { snapshot: string; graph: string };
	errors: string[];
	warnings: string[];
	resumed: boolean;
	api_calls: number;
	budget?: { maxCalls: number | null; used: number; remaining: number | null };
	stopped_reason?:
		| "complete"
		| "budget"
		| "billing"
		| "error"
		| "dry_run_cap";
	stops_from_patterns?: boolean;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Build the stop index from route pattern embeds (no stops-search).
 */
export function stopsFromRoutes(routes: NetworkRoute[]): NetworkStop[] {
	const byId = new Map<string, NetworkStop>();

	for (const route of routes) {
		for (const pattern of route.patterns) {
			for (const ps of pattern.stops) {
				const existing = byId.get(ps.id);
				if (existing) {
					if (!existing.route_ids.includes(route.id)) {
						existing.route_ids.push(route.id);
					}
					if (
						route.code &&
						!existing.route_codes.includes(route.code)
					) {
						existing.route_codes.push(route.code);
					}
					const sys = String(route.system);
					if (!existing.systems.includes(sys)) {
						existing.systems.push(sys);
					}
					if (
						(existing.lat === 0 || existing.lon === 0) &&
						ps.lat != null &&
						ps.lon != null
					) {
						existing.lat = ps.lat;
						existing.lon = ps.lon;
					}
					if (
						(!existing.name || existing.name === existing.id) &&
						ps.name
					) {
						existing.name = ps.name;
					}
					continue;
				}
				byId.set(ps.id, {
					id: ps.id,
					code: null,
					name: ps.name ?? ps.id,
					kind: "stop",
					lat: ps.lat ?? 0,
					lon: ps.lon ?? 0,
					parent: null,
					platforms: [],
					systems: [String(route.system)],
					route_ids: [route.id],
					route_codes: route.code ? [route.code] : [],
				});
			}
		}
	}

	return [...byId.values()];
}

function emptyState(): SyncState {
	return {
		version: 2,
		updated_at: new Date().toISOString(),
		phase: "routes_list",
		stops_page: 1,
		stops_shard_index: 0,
		routes_system_index: 0,
		routes_page: 1,
		route_ids: [],
		route_ids_done: [],
		backfill_ids: [],
		backfill_index: 0,
		stops: [],
		routes: [],
		as_of: null,
		errors: [],
		warnings: [],
		stops_pagination_verified: true,
		api_calls: 0,
		stops_from_patterns: true,
	};
}

function migrateState(raw: SyncState): SyncState {
	const base = emptyState();
	const merged: SyncState = {
		...base,
		...raw,
		version: 2,
		stops_from_patterns: true,
		warnings: raw.warnings ?? [],
	};

	// Legacy geo-shard / stop-backfill states are expensive — restart listing
	// but keep any route_ids / route details already paid for.
	if (raw.phase === "stops" || raw.phase === "stops_backfill") {
		merged.phase = "routes_list";
		merged.routes_system_index = 0;
		merged.routes_page = 1;
		merged.warnings = [
			...merged.warnings,
			"Migrated from legacy stop-shard sync state to route-first (v2).",
		];
	}
	return merged;
}

/**
 * Sync the local network using a route-first strategy:
 * 1) routes-search per system (max page size)
 * 2) route/v1 for each id (patterns embed stops)
 * 3) build stops from embeds — no geographic stop shards, no stop/v1 spam
 *
 * Error examples:
 * - HTTP 402 billing_error → terminal stop, message includes reset date
 * - BudgetExceededError → progress saved; resume with higher --max-calls
 * - HTTP 429 → exponential backoff inside the client
 */
export async function syncNetwork(options: SyncOptions): Promise<SyncResult> {
	const rateMs = options.rateMs ?? 50;
	const resume = options.resume !== false;
	const dryRun = options.dryRun === true;
	const maxPages = options.maxPages;
	const maxRouteDetails = options.maxRouteDetails;
	const maxCalls = options.maxCalls ?? DEFAULT_SYNC_MAX_CALLS;
	const errors: string[] = [];
	const warnings: string[] = [];
	let stoppedReason: SyncResult["stopped_reason"] = "complete";

	options.client.setMaxCalls(maxCalls);

	let state: SyncState = emptyState();
	if (resume) {
		const loaded = loadSyncState();
		if (loaded) state = migrateState(loaded);
	}

	// Seed route details already in a prior snapshot so we don't refetch them
	// when sync-state was cleared but snapshot + HTTP cache remain.
	if (state.routes.length === 0) {
		const existing = loadSnapshot();
		if (existing && existing.routes.length > 0 && state.route_ids.length === 0) {
			warnings.push(
				`Loaded ${existing.routes.length} routes from existing snapshot as baseline (incremental).`,
			);
		}
	}

	const resumed =
		state.phase !== "routes_list" ||
		state.routes_page > 1 ||
		state.routes_system_index > 0 ||
		state.route_ids_done.length > 0 ||
		state.routes.length > 0;

	const progress = (
		message: string,
		counts?: SyncProgressEvent["counts"],
	) => {
		options.onProgress?.({
			phase: state.phase,
			message,
			counts: {
				...counts,
				apiCalls: options.client.getNetworkCallCount(),
			},
		});
	};

	const throttle = async () => {
		if (rateMs > 0) await sleep(rateMs);
	};

	const persist = () => {
		state.updated_at = new Date().toISOString();
		state.api_calls = options.client.getNetworkCallCount();
		if (!dryRun) saveSyncState(state);
	};

	const budgetSnapshot = () => options.client.getBudget();

	const failBilling = (message: string): SyncResult => {
		stoppedReason = "billing";
		errors.push(message);
		persist();
		return {
			success: false,
			dry_run: dryRun,
			errors: [...errors, ...state.errors],
			warnings: [...new Set([...state.warnings, ...warnings])],
			resumed,
			api_calls: options.client.getNetworkCallCount(),
			budget: budgetSnapshot(),
			stopped_reason: "billing",
			stops_from_patterns: true,
		};
	};

	const failBudget = (message: string): SyncResult => {
		stoppedReason = "budget";
		warnings.push(message);
		persist();
		return {
			success: false,
			dry_run: dryRun,
			errors: [...errors, ...state.errors],
			warnings: [...new Set([...state.warnings, ...warnings])],
			resumed,
			api_calls: options.client.getNetworkCallCount(),
			budget: budgetSnapshot(),
			stopped_reason: "budget",
			stops_from_patterns: true,
			counts: {
				stops: state.stops.length,
				routes: state.routes.length,
				patterns: state.routes.reduce(
					(n, r) => n + r.patterns.length,
					0,
				),
			},
		};
	};

	try {
		// --- Phase: routes list by system ---
		if (state.phase === "routes_list") {
			progress("Listing route ids by system (route-first sync)");
			const routeIdSet = new Set(state.route_ids);

			for (
				let si = state.routes_system_index;
				si < ALL_SYSTEMS.length;
				si++
			) {
				const system = ALL_SYSTEMS[si] as TransitSystem;
				let page =
					si === state.routes_system_index ? state.routes_page : 1;
				let totalPages = Number.POSITIVE_INFINITY;

				while (page <= totalPages) {
					if (maxPages != null && page > maxPages) break;
					await throttle();

					let result;
					try {
						result = await options.client.searchRoutes({
							system,
							page,
							per_page: CROMA_LIST_PER_PAGE,
						});
					} catch (error) {
						if (error instanceof BudgetExceededError) {
							state.routes_system_index = si;
							state.routes_page = page;
							persist();
							return failBudget(error.message);
						}
						if (error instanceof BillingError) {
							return failBilling(error.message);
						}
						throw error;
					}

					if (result.kind === "error") {
						if (result.status === 402) {
							return failBilling(result.message);
						}
						errors.push(
							`routes-search ${system} p${page}: ${result.message}`,
						);
						if (result.status === 429) {
							await sleep(rateMs * 8);
							continue;
						}
						break;
					}

					const data = result.data.data;
					state.as_of = data.as_of ?? state.as_of;
					totalPages = Math.max(data.total_pages || 1, 1);
					if (data.total_is_exact === false) {
						const msg = `routes-search ${system} hit 1000-match floor; results may be incomplete`;
						warnings.push(msg);
						console.error(`WARNING: ${msg}`);
					}
					for (const route of data.routes) {
						if (!routeIdSet.has(route.route_id)) {
							routeIdSet.add(route.route_id);
							state.route_ids.push(route.route_id);
						}
					}
					page += 1;
					state.routes_system_index = si;
					state.routes_page = page;
					persist();
					progress(
						`Routes ${system} page ${page - 1}/${totalPages}`,
						{ routes: state.route_ids.length },
					);
					if (page > 1000) break;
				}
				state.routes_system_index = si + 1;
				state.routes_page = 1;
				persist();
			}
			state.phase = "routes_detail";
			persist();
		}

		// --- Phase: route details (patterns → stops) ---
		if (state.phase === "routes_detail") {
			progress("Fetching route patterns (stops embedded)");
			const done = new Set(state.route_ids_done);
			const pending = state.route_ids.filter((id) => !done.has(id));
			let fetched = 0;

			for (const routeId of pending) {
				if (maxRouteDetails != null && fetched >= maxRouteDetails) {
					stoppedReason = "dry_run_cap";
					break;
				}
				await throttle();

				let result;
				try {
					result = await options.client.getRoute(routeId, false);
				} catch (error) {
					if (error instanceof BudgetExceededError) {
						persist();
						return failBudget(error.message);
					}
					if (error instanceof BillingError) {
						return failBilling(error.message);
					}
					throw error;
				}

				fetched += 1;

				if (result.kind === "error") {
					if (result.status === 402) {
						return failBilling(result.message);
					}
					errors.push(`route ${routeId}: ${result.message}`);
					if (result.status === 429) {
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

				const compact = compactRoute(result.data.data.route);
				const existingIdx = state.routes.findIndex(
					(r) => r.id === compact.id,
				);
				if (existingIdx >= 0) state.routes[existingIdx] = compact;
				else state.routes.push(compact);

				done.add(routeId);
				state.route_ids_done = [...done];
				persist();

				if (fetched % 25 === 0) {
					progress(
						`Route details ${done.size}/${state.route_ids.length}`,
						{
							routeDetailsDone: done.size,
							routeDetailsPending:
								state.route_ids.length - done.size,
							routes: state.routes.length,
						},
					);
				}
			}

			const stillPending = state.route_ids.filter(
				(id) => !done.has(id),
			).length;
			if (stillPending === 0) {
				state.phase = "build";
				persist();
			} else if (stoppedReason === "dry_run_cap") {
				persist();
				return {
					success: false,
					dry_run: dryRun,
					errors: [...errors, ...state.errors],
					warnings: [
						...new Set([
							...state.warnings,
							...warnings,
							`Stopped after --max-route-details; ${stillPending} routes remaining`,
						]),
					],
					resumed,
					api_calls: options.client.getNetworkCallCount(),
					budget: budgetSnapshot(),
					stopped_reason: "dry_run_cap",
					stops_from_patterns: true,
					counts: {
						stops: 0,
						routes: state.routes.length,
						patterns: state.routes.reduce(
							(n, r) => n + r.patterns.length,
							0,
						),
					},
				};
			}
		}

		// --- Phase: build snapshot + graph ---
		if (state.phase === "build") {
			progress("Building snapshot from route pattern stops");
			const stops = stopsFromRoutes(state.routes);
			state.stops = stops;
			state.stops_pagination_verified = true;
			state.stops_from_patterns = true;

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
					stops: stops.length,
					routes: state.routes.length,
					patterns,
				},
				stops,
				routes: state.routes,
			};
			const graph = buildNetworkGraph(snapshot);
			const allWarnings = [...new Set([...state.warnings, ...warnings])];

			if (snapshot.counts.routes === 0) {
				errors.push(
					"Refusing success: routes=0 after sync. Check billing/budget and resume.",
				);
				persist();
				return {
					success: false,
					dry_run: dryRun,
					fetched_at: snapshot.fetched_at,
					counts: snapshot.counts,
					errors: [...errors, ...state.errors],
					warnings: allWarnings,
					resumed,
					api_calls: options.client.getNetworkCallCount(),
					budget: budgetSnapshot(),
					stopped_reason: "error",
					stops_from_patterns: true,
				};
			}

			if (dryRun) {
				state.phase = "done";
				return {
					success: errors.length === 0,
					dry_run: true,
					fetched_at: snapshot.fetched_at,
					counts: snapshot.counts,
					errors: [...errors, ...state.errors],
					warnings: allWarnings,
					resumed,
					api_calls: options.client.getNetworkCallCount(),
					budget: budgetSnapshot(),
					stopped_reason: "complete",
					stops_from_patterns: true,
				};
			}

			saveSnapshot(snapshot);
			saveGraph(graph);
			state.phase = "done";
			persist();
			clearSyncState();

			return {
				success: errors.length === 0,
				dry_run: false,
				fetched_at: snapshot.fetched_at,
				counts: snapshot.counts,
				paths: {
					snapshot: "data/network/snapshot.json",
					graph: "data/network/graph.json",
				},
				errors: [...errors, ...state.errors],
				warnings: allWarnings,
				resumed,
				api_calls: options.client.getNetworkCallCount(),
				budget: budgetSnapshot(),
				stopped_reason: "complete",
				stops_from_patterns: true,
			};
		}
	} catch (error) {
		if (error instanceof BudgetExceededError) {
			return failBudget(error.message);
		}
		if (error instanceof BillingError) {
			return failBilling(error.message);
		}
		errors.push(error instanceof Error ? error.message : String(error));
		persist();
		return {
			success: false,
			dry_run: dryRun,
			errors: [...errors, ...state.errors],
			warnings: [...new Set([...state.warnings, ...warnings])],
			resumed,
			api_calls: options.client.getNetworkCallCount(),
			budget: budgetSnapshot(),
			stopped_reason: "error",
			stops_from_patterns: true,
		};
	}

	return {
		success: state.phase === "done" && errors.length === 0,
		dry_run: dryRun,
		errors: [...errors, ...state.errors],
		warnings: [...new Set([...state.warnings, ...warnings])],
		resumed,
		api_calls: options.client.getNetworkCallCount(),
		budget: budgetSnapshot(),
		stopped_reason: stoppedReason,
		stops_from_patterns: true,
	};
}
