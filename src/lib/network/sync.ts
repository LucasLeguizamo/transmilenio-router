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

/**
 * Croma stops-search / routes-search: `total` is counted up to 1000;
 * `total_is_exact` is false when there are more matches (OpenAPI).
 * Unfiltered paging alone therefore cannot ingest the full network.
 */
const CROMA_SEARCH_TOTAL_CAP = 1000;

/** Bogotá bounding box for overlapping proximity shards. */
const BOGOTA_BOUNDS = {
	minLat: 4.45,
	maxLat: 4.84,
	minLon: -74.25,
	maxLon: -74.01,
};
const GEO_STEP = 0.035; // ~3.9 km
const GEO_RADIUS_M = 2800;

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
	/** Cap geographic shards for dry-run / testing. */
	maxShards?: number;
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
		backfillDone?: number;
		backfillPending?: number;
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
	stops_pagination_verified?: boolean;
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

function compactStopFromPattern(args: {
	id: string;
	name: string | null;
	lat: number | null;
	lon: number | null;
}): NetworkStop {
	return {
		id: args.id,
		code: null,
		name: args.name ?? args.id,
		kind: "stop",
		lat: args.lat ?? 0,
		lon: args.lon ?? 0,
		parent: null,
		platforms: [],
		systems: [],
		route_ids: [],
		route_codes: [],
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

function bogotaGeoShards(): Array<{
	latitude: number;
	longitude: number;
	radius_m: number;
	label: string;
}> {
	const shards: Array<{
		latitude: number;
		longitude: number;
		radius_m: number;
		label: string;
	}> = [];
	for (let lat = BOGOTA_BOUNDS.minLat; lat <= BOGOTA_BOUNDS.maxLat; lat += GEO_STEP) {
		for (
			let lon = BOGOTA_BOUNDS.minLon;
			lon <= BOGOTA_BOUNDS.maxLon;
			lon += GEO_STEP
		) {
			shards.push({
				latitude: Number(lat.toFixed(5)),
				longitude: Number(lon.toFixed(5)),
				radius_m: GEO_RADIUS_M,
				label: `geo:${lat.toFixed(3)},${lon.toFixed(3)}`,
			});
		}
	}
	return shards;
}

function emptyState(): SyncState {
	return {
		version: 1,
		updated_at: new Date().toISOString(),
		phase: "stops",
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
		stops_pagination_verified: false,
	};
}

function migrateState(raw: SyncState): SyncState {
	return {
		...emptyState(),
		...raw,
		stops_shard_index: raw.stops_shard_index ?? 0,
		backfill_ids: raw.backfill_ids ?? [],
		backfill_index: raw.backfill_index ?? 0,
		warnings: raw.warnings ?? [],
		stops_pagination_verified: raw.stops_pagination_verified ?? false,
	};
}

/**
 * Fetch the full TransMilenio/SITP network from Croma into a local snapshot + graph.
 * Idempotent and resumable via data/network/sync-state.json.
 *
 * Error examples:
 * - Missing CROMA_API_KEY → caller should fail before invoke
 * - HTTP 429 → backs off and retries; recorded in errors if exhausted
 * - Stops capped at 1000 without sharding → hard error / loud warning
 */
export async function syncNetwork(options: SyncOptions): Promise<SyncResult> {
	const rateMs = options.rateMs ?? 200;
	const resume = options.resume !== false;
	const dryRun = options.dryRun === true;
	const maxPages = options.maxPages;
	const maxRouteDetails = options.maxRouteDetails;
	const maxShards = options.maxShards;
	let apiCalls = 0;
	const errors: string[] = [];
	const warnings: string[] = [];

	let state: SyncState = emptyState();
	if (resume) {
		const loaded = loadSyncState();
		if (loaded) state = migrateState(loaded);
	}
	const resumed =
		state.phase !== "stops" ||
		state.stops_page > 1 ||
		state.stops_shard_index > 0 ||
		state.stops.length > 0;

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

	const callApi = async <
		T extends { kind: string; status?: number; message?: string },
	>(
		label: string,
		fn: () => Promise<T>,
	): Promise<T | null> => {
		for (let attempt = 0; attempt < 4; attempt++) {
			apiCalls += 1;
			try {
				const result = await fn();
				if (result.kind === "error" && result.status === 429 && attempt < 3) {
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

	const stopIds = () => new Set(state.stops.map((s) => s.id));

	const addStops = (stops: Stop[]) => {
		const ids = stopIds();
		let added = 0;
		for (const stop of stops) {
			if (ids.has(stop.stop_id)) continue;
			ids.add(stop.stop_id);
			state.stops.push(compactStop(stop));
			added += 1;
		}
		return added;
	};

	type PageResult = {
		exact: boolean;
		pagesFetched: number;
		hitCap: boolean;
	};

	const fetchStopShard = async (params: {
		label: string;
		kind?: "" | "station" | "stop";
		latitude?: number;
		longitude?: number;
		radius_m?: number;
	}): Promise<PageResult> => {
		let page = 1;
		let totalPages = Number.POSITIVE_INFINITY;
		let exact = true;
		let hitCap = false;
		let pagesFetched = 0;
		let emptyStreak = 0;

		while (page <= totalPages) {
			if (maxPages != null && pagesFetched >= maxPages) break;
			await throttle();
			const result = await callApi(
				`stops-search ${params.label} p${page}`,
				async () =>
					options.client.searchStops({
						kind: params.kind,
						latitude: params.latitude,
						longitude: params.longitude,
						radius_m: params.radius_m,
						page,
						per_page: 100,
					}),
			);
			if (!result || result.kind === "error") {
				errors.push(
					`stops-search ${params.label} p${page}: ${result && result.kind === "error" ? result.message : "failed"}`,
				);
				if (result && result.kind === "error" && result.status === 429) {
					await sleep(rateMs * 8);
					continue;
				}
				break;
			}

			const data = result.data.data;
			state.as_of = data.as_of ?? state.as_of;
			totalPages = Math.max(data.total_pages || 1, 1);
			if (data.total_is_exact === false) {
				exact = false;
				hitCap = true;
			}
			if (data.total >= CROMA_SEARCH_TOTAL_CAP && data.total_is_exact === false) {
				hitCap = true;
			}

			const added = addStops(data.stops);
			pagesFetched += 1;
			if (data.stops.length === 0) {
				emptyStreak += 1;
				if (emptyStreak >= 2) break;
			} else {
				emptyStreak = 0;
			}

			page += 1;
			state.stops_page = page;
			persist();
			progress(
				`stops ${params.label} page ${page - 1}/${totalPages} (+${added})`,
				{ stops: state.stops.length },
			);

			// OpenAPI page maximum is 1000; stop before invalid pages.
			if (page > 1000) break;
		}

		return { exact, pagesFetched, hitCap };
	};

	// --- Phase: stops (kind shards + geographic shards) ---
	if (state.phase === "stops") {
		progress("Fetching stops (sharded; Croma caps unfiltered total at 1000)");

		const kindShards: Array<{ kind: "" | "station" | "stop"; label: string }> = [
			{ kind: "station", label: "kind:station" },
			{ kind: "stop", label: "kind:stop" },
		];
		const geoShards = bogotaGeoShards().flatMap((g) => [
			{ ...g, kind: "stop" as const, label: `${g.label}:stop` },
			{ ...g, kind: "station" as const, label: `${g.label}:station` },
		]);

		const allShards: Array<{
			label: string;
			kind?: "" | "station" | "stop";
			latitude?: number;
			longitude?: number;
			radius_m?: number;
		}> = [
			...kindShards,
			...geoShards.map((g) => ({
				label: g.label,
				kind: g.kind,
				latitude: g.latitude,
				longitude: g.longitude,
				radius_m: g.radius_m,
			})),
		];

		let shardsComplete = true;
		let startIdx = state.stops_shard_index;
		for (let i = startIdx; i < allShards.length; i++) {
			if (maxShards != null && i >= maxShards) {
				warnings.push(
					`Stopped after ${maxShards} shards (--max-shards); pagination not fully verified`,
				);
				shardsComplete = false;
				break;
			}
			const shard = allShards[i];
			state.stops_shard_index = i;
			state.stops_page = 1;
			persist();
			const result = await fetchStopShard(shard);
			// Unfiltered kind shards are expected to hit the 1000 floor; geo shards continue.
			if (result.hitCap && !shard.latitude) {
				warnings.push(
					`Shard ${shard.label} hit Croma ${CROMA_SEARCH_TOTAL_CAP}-match floor (total_is_exact=false); continuing with geographic shards`,
				);
				console.error(`WARNING: ${warnings[warnings.length - 1]}`);
			}
		}

		if (shardsComplete) {
			state.stops_shard_index = allShards.length;
		}

		if (state.stops.length === CROMA_SEARCH_TOTAL_CAP) {
			const msg =
				`Stop count is exactly ${CROMA_SEARCH_TOTAL_CAP} after sharding — still looks capped. ` +
				`Croma stops-search totals are floored at 1000 (OpenAPI total_is_exact). Backfill + re-check required.`;
			warnings.push(msg);
			console.error(`WARNING: ${msg}`);
			shardsComplete = false;
		} else if (
			state.stops.length > 0 &&
			state.stops.length % CROMA_SEARCH_TOTAL_CAP === 0
		) {
			const msg = `Stop count ${state.stops.length} is a multiple of ${CROMA_SEARCH_TOTAL_CAP}; will verify via pattern-stop backfill.`;
			warnings.push(msg);
			console.error(`WARNING: ${msg}`);
		}

		// Tentative; finalized after backfill when dangling pattern stops are gone.
		state.stops_pagination_verified = shardsComplete;
		state.warnings = [...new Set([...state.warnings, ...warnings])];
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
				const data = result.data.data;
				state.as_of = data.as_of ?? state.as_of;
				totalPages = data.total_pages || 1;
				if (data.total_is_exact === false) {
					const msg = `routes-search ${system} hit 1000-match floor; results may be incomplete for this system`;
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
				progress(`Routes ${system} page ${page - 1}/${totalPages}`, {
					routes: state.route_ids.length,
				});
				if (page > 1000) break;
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
		state.phase = "stops_backfill";
		persist();
	}

	// --- Phase: backfill pattern stop ids missing from snapshot ---
	if (state.phase === "stops_backfill") {
		progress("Backfilling pattern-referenced stops via stop/v1");
		const known = stopIds();
		const missing = new Set<string>();
		const patternMeta = new Map<
			string,
			{ name: string | null; lat: number | null; lon: number | null }
		>();
		for (const route of state.routes) {
			for (const pattern of route.patterns) {
				for (const ps of pattern.stops) {
					if (!known.has(ps.id)) {
						missing.add(ps.id);
						patternMeta.set(ps.id, {
							name: ps.name,
							lat: ps.lat,
							lon: ps.lon,
						});
					}
				}
			}
		}

		if (state.backfill_ids.length === 0) {
			state.backfill_ids = [...missing];
			state.backfill_index = 0;
			persist();
		}

		while (state.backfill_index < state.backfill_ids.length) {
			const stopId = state.backfill_ids[state.backfill_index];
			await throttle();
			const result = await callApi(`stop ${stopId}`, async () =>
				options.client.getStop(stopId),
			);
			if (result?.kind === "success" && result.data.data.stop) {
				addStops([result.data.data.stop]);
			} else {
				const meta = patternMeta.get(stopId);
				if (meta && (meta.lat != null || meta.name)) {
					const ids = stopIds();
					if (!ids.has(stopId)) {
						state.stops.push(
							compactStopFromPattern({
								id: stopId,
								name: meta.name,
								lat: meta.lat,
								lon: meta.lon,
							}),
						);
						warnings.push(
							`stop/v1 missing for ${stopId}; used pattern coordinates/name stub`,
						);
					}
				} else {
					errors.push(
						`stop backfill ${stopId}: ${result && result.kind === "error" ? result.message : "not found"}`,
					);
				}
			}
			state.backfill_index += 1;
			if (state.backfill_index % 50 === 0) {
				persist();
				progress(
					`Backfill ${state.backfill_index}/${state.backfill_ids.length}`,
					{
						stops: state.stops.length,
						backfillDone: state.backfill_index,
						backfillPending:
							state.backfill_ids.length - state.backfill_index,
					},
				);
			}
		}
		persist();

		// Re-check dangling after backfill
		const knownAfter = stopIds();
		let stillMissing = 0;
		for (const route of state.routes) {
			for (const pattern of route.patterns) {
				for (const ps of pattern.stops) {
					if (!knownAfter.has(ps.id)) stillMissing += 1;
				}
			}
		}
		if (stillMissing > 0) {
			const msg = `${stillMissing} pattern stop ids still missing after backfill`;
			warnings.push(msg);
			console.error(`WARNING: ${msg}`);
			state.stops_pagination_verified = false;
		} else if (state.stops.length > CROMA_SEARCH_TOTAL_CAP) {
			state.stops_pagination_verified = true;
		}

		state.warnings = [...new Set([...state.warnings, ...warnings])];
		state.phase = "build";
		persist();
	}

	// --- Phase: build snapshot + graph ---
	if (state.phase === "build") {
		progress("Building snapshot and graph");
		const patterns = state.routes.reduce((n, r) => n + r.patterns.length, 0);
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
		const allWarnings = [...new Set([...state.warnings, ...warnings])];

		const cappedLooksBroken =
			snapshot.counts.stops <= CROMA_SEARCH_TOTAL_CAP ||
			(snapshot.counts.stops % CROMA_SEARCH_TOTAL_CAP === 0 &&
				!state.stops_pagination_verified);

		if (cappedLooksBroken) {
			const msg =
				`Refusing success: stops=${snapshot.counts.stops}, ` +
				`stops_pagination_verified=${state.stops_pagination_verified}. ` +
				`Croma floors search totals at ${CROMA_SEARCH_TOTAL_CAP}; expected thousands of SITP/TM stops after geo shards + backfill.`;
			errors.push(msg);
			console.error(`ERROR: ${msg}`);
			if (!dryRun) {
				saveSnapshot(snapshot);
				saveGraph(graph);
			}
			state.phase = "done";
			persist();
			return {
				success: false,
				dry_run: dryRun,
				fetched_at: snapshot.fetched_at,
				counts: snapshot.counts,
				paths: dryRun
					? undefined
					: {
							snapshot: "data/network/snapshot.json",
							graph: "data/network/graph.json",
						},
				errors: [...errors, ...state.errors],
				warnings: allWarnings,
				resumed,
				api_calls: apiCalls,
				stops_pagination_verified: false,
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
				api_calls: apiCalls,
				stops_pagination_verified: state.stops_pagination_verified,
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
			api_calls: apiCalls,
			stops_pagination_verified: state.stops_pagination_verified,
		};
	}

	return {
		success: state.phase === "done" && errors.length === 0,
		dry_run: dryRun,
		errors: [...errors, ...state.errors],
		warnings: [...new Set([...state.warnings, ...warnings])],
		resumed,
		api_calls: apiCalls,
		stops_pagination_verified: state.stops_pagination_verified,
	};
}
