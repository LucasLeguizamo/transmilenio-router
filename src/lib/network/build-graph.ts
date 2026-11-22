import { haversineDistance } from "../geo/haversine";
import type {
	NetworkGraph,
	NetworkSnapshot,
	NetworkStop,
	WalkEdge,
} from "./types";
import { NETWORK_GRAPH_VERSION } from "./types";

const DEFAULT_TRANSFER_WALK_M = 350;
/** ~350m in degrees at Bogotá latitude — coarse spatial bucket. */
const GRID_DEG = 0.0032;

function gridKey(lat: number, lon: number): string {
	return `${Math.floor(lat / GRID_DEG)}:${Math.floor(lon / GRID_DEG)}`;
}

/**
 * Build stop→routes, route patterns, and walking transfer edges.
 * Walk edges: station↔platforms, stations within radius, stops near stations.
 */
export function buildNetworkGraph(
	snapshot: NetworkSnapshot,
	options?: { transferWalkMeters?: number },
): NetworkGraph {
	const transferWalk = options?.transferWalkMeters ?? DEFAULT_TRANSFER_WALK_M;
	const stopsById = new Map<string, NetworkStop>();
	for (const stop of snapshot.stops) {
		stopsById.set(stop.id, stop);
	}

	const stopToRoutes: Record<string, string[]> = {};
	const routePatterns: NetworkGraph["route_patterns"] = {};
	const stationPlatforms: Record<string, string[]> = {};
	const platformStation: Record<string, string> = {};

	for (const stop of snapshot.stops) {
		stopToRoutes[stop.id] = [...stop.route_ids];
		if (stop.kind === "station" && stop.platforms.length > 0) {
			stationPlatforms[stop.id] = [...stop.platforms];
			for (const platformId of stop.platforms) {
				platformStation[platformId] = stop.id;
			}
		}
		if (stop.parent) {
			platformStation[stop.id] = stop.parent;
		}
	}

	for (const route of snapshot.routes) {
		routePatterns[route.id] = route.patterns.map((pattern) => ({
			shape_id: pattern.shape_id,
			stop_ids: pattern.stops.map((s) => s.id),
			offsets: pattern.stops.map((s) => s.offset),
		}));
		for (const pattern of route.patterns) {
			for (const ps of pattern.stops) {
				const list = stopToRoutes[ps.id] ?? [];
				if (!list.includes(route.id)) list.push(route.id);
				stopToRoutes[ps.id] = list;
			}
		}
	}

	const walkEdges: WalkEdge[] = [];
	const edgeKey = new Set<string>();
	const addEdge = (from: string, to: string, meters: number) => {
		if (from === to) return;
		const a = from < to ? from : to;
		const b = from < to ? to : from;
		const key = `${a}|${b}`;
		if (edgeKey.has(key)) return;
		edgeKey.add(key);
		walkEdges.push({ from: a, to: b, meters: Math.round(meters) });
	};

	for (const [stationId, platforms] of Object.entries(stationPlatforms)) {
		const station = stopsById.get(stationId);
		for (const platformId of platforms) {
			const platform = stopsById.get(platformId);
			const meters =
				station && platform
					? haversineDistance(
							station.lat,
							station.lon,
							platform.lat,
							platform.lon,
						)
					: 40;
			addEdge(stationId, platformId, Math.max(meters, 20));
		}
	}

	const buckets = new Map<string, NetworkStop[]>();
	for (const stop of snapshot.stops) {
		const key = gridKey(stop.lat, stop.lon);
		const list = buckets.get(key) ?? [];
		list.push(stop);
		buckets.set(key, list);
	}

	const neighborOffsets = [-1, 0, 1];
	for (const stop of snapshot.stops) {
		const gx = Math.floor(stop.lat / GRID_DEG);
		const gy = Math.floor(stop.lon / GRID_DEG);
		for (const dx of neighborOffsets) {
			for (const dy of neighborOffsets) {
				const others = buckets.get(`${gx + dx}:${gy + dy}`) ?? [];
				for (const other of others) {
					if (other.id <= stop.id) continue;
					const meters = haversineDistance(
						stop.lat,
						stop.lon,
						other.lat,
						other.lon,
					);
					if (meters > transferWalk) continue;
					const stationPair =
						stop.kind === "station" || other.kind === "station";
					const parentLink =
						stop.parent === other.id || other.parent === stop.id;
					if (stationPair || parentLink || meters <= 120) {
						addEdge(stop.id, other.id, meters);
					}
				}
			}
		}
	}

	return {
		version: NETWORK_GRAPH_VERSION,
		built_at: new Date().toISOString(),
		snapshot_fetched_at: snapshot.fetched_at,
		stop_to_routes: stopToRoutes,
		route_patterns: routePatterns,
		walk_edges: walkEdges,
		station_platforms: stationPlatforms,
		platform_station: platformStation,
	};
}
