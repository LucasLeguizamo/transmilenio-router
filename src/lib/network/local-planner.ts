import { haversineDistance, walkMinutes } from "../geo/haversine";
import {
	geocodeBogota,
	looksLikeBogotaAddress,
	looksLikeNeighborhood,
} from "../geocode/bogota";
import type {
	RoutePlan,
	RoutePlanRequest,
	RoutePlanResult,
	RouteSegment,
	TransferSegment,
	WalkSegment,
} from "../routing/types";
import type { TransitSystem } from "../croma/types";
import type { LoadedNetwork } from "./store";
import type { NetworkStop } from "./types";

const DEFAULT_MAX_WALK = 800;
const GEOCODED_WALK = 1200;

type Point = { latitude: number; longitude: number; name: string };

function normalize(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function scoreName(stop: NetworkStop, query: string): number {
	const q = normalize(query);
	const name = normalize(stop.name);
	let score = 0;
	if (stop.kind === "station") score += 100;
	if (name === q) score += 50;
	else if (name.includes(q) || q.includes(name)) score += 20;
	return score;
}

function nearbyStops(
	stops: NetworkStop[],
	lat: number,
	lon: number,
	radiusM: number,
): NetworkStop[] {
	return stops
		.map((stop) => ({
			stop,
			d: haversineDistance(lat, lon, stop.lat, stop.lon),
		}))
		.filter((x) => x.d <= radiusM)
		.sort((a, b) => a.d - b.d)
		.map((x) => x.stop)
		.slice(0, 20);
}

function resolveByName(
	stops: NetworkStop[],
	query: string,
): { point: Point; stops: NetworkStop[] } | null {
	const ranked = [...stops]
		.map((stop) => ({ stop, score: scoreName(stop, query) }))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);
	if (ranked.length === 0) return null;
	const top = ranked.slice(0, 10).map((x) => x.stop);
	const primary = top[0];
	return {
		point: {
			latitude: primary.lat,
			longitude: primary.lon,
			name: primary.name,
		},
		stops: top,
	};
}

async function resolveEndpoint(
	network: LoadedNetwork,
	location: RoutePlanRequest["origin"],
	maxWalk: number,
): Promise<{ point: Point; stops: NetworkStop[] } | null> {
	const { snapshot } = network;
	if (location.latitude != null && location.longitude != null) {
		const point: Point = {
			latitude: location.latitude,
			longitude: location.longitude,
			name:
				location.text ??
				`${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
		};
		return {
			point,
			stops: nearbyStops(
				snapshot.stops,
				point.latitude,
				point.longitude,
				maxWalk,
			),
		};
	}
	if (!location.text) return null;
	const query = location.text.trim();
	const preferGeo =
		looksLikeBogotaAddress(query) || looksLikeNeighborhood(query);

	if (!preferGeo) {
		const named = resolveByName(snapshot.stops, query);
		if (named) return named;
	}

	const geo = await geocodeBogota(query);
	if (geo.kind === "success") {
		const radius = Math.max(maxWalk, GEOCODED_WALK);
		return {
			point: {
				latitude: geo.point.latitude,
				longitude: geo.point.longitude,
				name: geo.point.displayName || query,
			},
			stops: nearbyStops(
				snapshot.stops,
				geo.point.latitude,
				geo.point.longitude,
				radius,
			),
		};
	}

	return resolveByName(snapshot.stops, query);
}

function expandIds(
	stop: NetworkStop,
	graph: LoadedNetwork["graph"],
): Set<string> {
	const ids = new Set<string>([stop.id]);
	if (stop.parent) ids.add(stop.parent);
	for (const p of stop.platforms) ids.add(p);
	const station = graph.platform_station[stop.id];
	if (station) {
		ids.add(station);
		for (const p of graph.station_platforms[station] ?? []) ids.add(p);
	}
	for (const p of graph.station_platforms[stop.id] ?? []) ids.add(p);
	return ids;
}

function findIndex(stopIds: string[], candidates: Set<string>): number {
	for (let i = 0; i < stopIds.length; i++) {
		if (candidates.has(stopIds[i])) return i;
	}
	return -1;
}

function routeMeta(
	network: LoadedNetwork,
	routeId: string,
): {
	route_id: string;
	short_name: string | null;
	long_name: string | null;
	system: TransitSystem;
	color: string | null;
} | null {
	const route = network.snapshot.routes.find((r) => r.id === routeId);
	if (!route) return null;
	return {
		route_id: route.id,
		short_name: route.code,
		long_name: route.name,
		system: route.system as TransitSystem,
		color: route.color,
	};
}

function stopPoint(
	network: LoadedNetwork,
	stopId: string,
): { stop_id: string; name: string; latitude: number; longitude: number } {
	const stop = network.snapshot.stops.find((s) => s.id === stopId);
	return {
		stop_id: stopId,
		name: stop?.name ?? stopId,
		latitude: stop?.lat ?? 0,
		longitude: stop?.lon ?? 0,
	};
}

function estimateMinutes(
	offsets: Array<number | null>,
	fromIdx: number,
	toIdx: number,
): number {
	const a = offsets[fromIdx];
	const b = offsets[toIdx];
	if (a != null && b != null) return Math.max(Math.round((b - a) / 60), 1);
	return Math.max((toIdx - fromIdx) * 2, 1);
}

function walkNeighbors(
	graph: LoadedNetwork["graph"],
	stopId: string,
): Array<{ id: string; meters: number }> {
	const out: Array<{ id: string; meters: number }> = [];
	for (const edge of graph.walk_edges) {
		if (edge.from === stopId) out.push({ id: edge.to, meters: edge.meters });
		else if (edge.to === stopId)
			out.push({ id: edge.from, meters: edge.meters });
	}
	return out;
}

function candidateRouteIds(
	originStops: NetworkStop[],
	destStops: NetworkStop[],
	graph: LoadedNetwork["graph"],
): string[] {
	const originIds = new Set<string>();
	const destIds = new Set<string>();
	const originCodes = new Map<string, Set<string>>();
	const destCodes = new Map<string, Set<string>>();

	for (const stop of originStops) {
		for (const id of expandIds(stop, graph)) {
			for (const routeId of graph.stop_to_routes[id] ?? []) originIds.add(routeId);
		}
		for (let i = 0; i < stop.route_codes.length; i++) {
			const code = stop.route_codes[i]?.toUpperCase();
			if (!code) continue;
			const set = originCodes.get(code) ?? new Set();
			if (stop.route_ids[i]) set.add(stop.route_ids[i]);
			originCodes.set(code, set);
		}
	}
	for (const stop of destStops) {
		for (const id of expandIds(stop, graph)) {
			for (const routeId of graph.stop_to_routes[id] ?? []) destIds.add(routeId);
		}
		for (let i = 0; i < stop.route_codes.length; i++) {
			const code = stop.route_codes[i]?.toUpperCase();
			if (!code) continue;
			const set = destCodes.get(code) ?? new Set();
			if (stop.route_ids[i]) set.add(stop.route_ids[i]);
			destCodes.set(code, set);
		}
	}

	const out = new Set<string>([...originIds].filter((id) => destIds.has(id)));
	for (const code of originCodes.keys()) {
		if (!destCodes.has(code)) continue;
		for (const id of originCodes.get(code) ?? []) out.add(id);
		for (const id of destCodes.get(code) ?? []) out.add(id);
	}
	return [...out];
}

function buildWalk(
	from: Point,
	to: { stop_id: string; name: string; latitude: number; longitude: number },
): WalkSegment | null {
	const meters = haversineDistance(
		from.latitude,
		from.longitude,
		to.latitude,
		to.longitude,
	);
	if (meters <= 50) return null;
	return {
		kind: "walk",
		from,
		to,
		distanceMeters: Math.round(meters),
		estimatedMinutes: walkMinutes(meters),
	};
}

/**
 * Plan a route using only the local snapshot/graph (no per-hop Croma calls).
 */
export async function planRouteLocal(
	network: LoadedNetwork,
	request: RoutePlanRequest,
): Promise<RoutePlanResult> {
	const maxWalk = request.maxWalkMeters ?? DEFAULT_MAX_WALK;
	const maxTransfers = request.maxTransfers ?? 2;

	const origin = await resolveEndpoint(network, request.origin, maxWalk);
	if (!origin || origin.stops.length === 0) {
		return {
			kind: "no_route",
			reason: "Could not resolve origin against local network",
		};
	}
	const destination = await resolveEndpoint(
		network,
		request.destination,
		maxWalk,
	);
	if (!destination || destination.stops.length === 0) {
		return {
			kind: "no_route",
			reason: "Could not resolve destination against local network",
		};
	}

	const direct = findDirectLocal(
		network,
		origin.stops,
		destination.stops,
		origin.point,
		destination.point,
	);
	if (direct) {
		return {
			kind: "success",
			plan: finalizePlan(origin.point, destination.point, direct.segments, 0),
		};
	}

	if (maxTransfers > 0) {
		const transfer = findTransferLocal(
			network,
			origin.stops,
			destination.stops,
			origin.point,
			destination.point,
		);
		if (transfer) {
			return {
				kind: "success",
				plan: finalizePlan(
					origin.point,
					destination.point,
					transfer.segments,
					1,
				),
			};
		}
	}

	return {
		kind: "no_route",
		reason:
			"No local-network route found within the specified constraints. Try `pnpm network:sync` or increase walking/transfers.",
	};
}

function finalizePlan(
	origin: Point,
	destination: Point,
	segments: Array<WalkSegment | RouteSegment | TransferSegment>,
	transferCount: number,
): RoutePlan {
	let totalMinutes = 0;
	let totalWalkMinutes = 0;
	for (const segment of segments) {
		switch (segment.kind) {
			case "walk":
				totalMinutes += segment.estimatedMinutes;
				totalWalkMinutes += segment.estimatedMinutes;
				break;
			case "transit":
				totalMinutes += segment.estimatedMinutes ?? 0;
				break;
			case "transfer":
				totalMinutes += segment.walkMinutes;
				totalWalkMinutes += segment.walkMinutes;
				break;
			default: {
				const _exhaustive: never = segment;
				void _exhaustive;
			}
		}
	}
	return {
		origin,
		destination,
		segments,
		totalMinutes,
		totalWalkMinutes,
		transferCount,
		alerts: [],
		timestamp: new Date().toISOString(),
		limitations: [
			"Routed on the local Croma network snapshot (no per-hop API). Live arrivals/alerts still come from Croma.",
		],
	};
}

function findDirectLocal(
	network: LoadedNetwork,
	originStops: NetworkStop[],
	destStops: NetworkStop[],
	originPoint: Point,
	destPoint: Point,
): { segments: Array<WalkSegment | RouteSegment> } | null {
	const originIds = new Set<string>();
	const destIds = new Set<string>();
	for (const s of originStops) for (const id of expandIds(s, network.graph)) originIds.add(id);
	for (const s of destStops) for (const id of expandIds(s, network.graph)) destIds.add(id);

	for (const routeId of candidateRouteIds(originStops, destStops, network.graph)) {
		const meta = routeMeta(network, routeId);
		if (!meta) continue;
		for (const pattern of network.graph.route_patterns[routeId] ?? []) {
			const boardIdx = findIndex(pattern.stop_ids, originIds);
			const alightIdx = findIndex(pattern.stop_ids, destIds);
			if (boardIdx === -1 || alightIdx === -1 || boardIdx >= alightIdx) continue;

			const board = stopPoint(network, pattern.stop_ids[boardIdx]);
			const alight = stopPoint(network, pattern.stop_ids[alightIdx]);
			const segments: Array<WalkSegment | RouteSegment> = [];
			const walkIn = buildWalk(originPoint, board);
			if (walkIn) segments.push(walkIn);
			segments.push({
				kind: "transit",
				route: meta,
				boardStop: board,
				alightStop: alight,
				intermediateStops: pattern.stop_ids
					.slice(boardIdx + 1, alightIdx)
					.map((id) => stopPoint(network, id)),
				estimatedMinutes: estimateMinutes(
					pattern.offsets,
					boardIdx,
					alightIdx,
				),
				geometry: null,
			});
			const walkOut = buildWalk(
				{ latitude: alight.latitude, longitude: alight.longitude, name: alight.name },
				{
					stop_id: alight.stop_id,
					name: destPoint.name,
					latitude: destPoint.latitude,
					longitude: destPoint.longitude,
				},
			);
			if (walkOut) segments.push(walkOut);
			return { segments };
		}
	}
	return null;
}

function findTransferLocal(
	network: LoadedNetwork,
	originStops: NetworkStop[],
	destStops: NetworkStop[],
	originPoint: Point,
	destPoint: Point,
): {
	segments: Array<WalkSegment | RouteSegment | TransferSegment>;
} | null {
	const destIds = new Set<string>();
	for (const s of destStops) for (const id of expandIds(s, network.graph)) destIds.add(id);

	type Cand = {
		score: number;
		segments: Array<WalkSegment | RouteSegment | TransferSegment>;
	};
	let best: Cand | null = null;

	for (const originStop of originStops.slice(0, 10)) {
		const originExpanded = expandIds(originStop, network.graph);
		const originRouteIds = new Set<string>();
		for (const id of originExpanded) {
			for (const rid of network.graph.stop_to_routes[id] ?? []) originRouteIds.add(rid);
		}

		for (const routeId of [...originRouteIds].slice(0, 8)) {
			const meta1 = routeMeta(network, routeId);
			if (!meta1) continue;
			for (const pattern of network.graph.route_patterns[routeId] ?? []) {
				const boardIdx = findIndex(pattern.stop_ids, originExpanded);
				if (boardIdx === -1) continue;
				const step = Math.max(
					1,
					Math.floor((pattern.stop_ids.length - boardIdx) / 15),
				);
				for (
					let transferIdx = boardIdx + 1;
					transferIdx < pattern.stop_ids.length;
					transferIdx += step
				) {
					const transferId = pattern.stop_ids[transferIdx];
					const hubs = [
						{ id: transferId, meters: 0 },
						...walkNeighbors(network.graph, transferId).slice(0, 6),
					];
					for (const hub of hubs) {
						const hubRoutes = (network.graph.stop_to_routes[hub.id] ?? []).filter(
							(id) => id !== routeId,
						);
						for (const connectingId of hubRoutes.slice(0, 6)) {
							const meta2 = routeMeta(network, connectingId);
							if (!meta2) continue;
							for (const pattern2 of network.graph.route_patterns[connectingId] ??
								[]) {
								const secondBoard = findIndex(
									pattern2.stop_ids,
									new Set([hub.id, ...(network.graph.station_platforms[hub.id] ?? [])]),
								);
								const alightIdx = findIndex(pattern2.stop_ids, destIds);
								if (
									secondBoard === -1 ||
									alightIdx === -1 ||
									secondBoard >= alightIdx
								) {
									continue;
								}

								const board = stopPoint(network, pattern.stop_ids[boardIdx]);
								const alight1 = stopPoint(network, transferId);
								const board2 = stopPoint(network, pattern2.stop_ids[secondBoard]);
								const alight2 = stopPoint(network, pattern2.stop_ids[alightIdx]);
								const segments: Array<
									WalkSegment | RouteSegment | TransferSegment
								> = [];
								const walkIn = buildWalk(originPoint, board);
								if (walkIn) segments.push(walkIn);
								const leg1Min = estimateMinutes(
									pattern.offsets,
									boardIdx,
									transferIdx,
								);
								segments.push({
									kind: "transit",
									route: meta1,
									boardStop: board,
									alightStop: alight1,
									intermediateStops: pattern.stop_ids
										.slice(boardIdx + 1, transferIdx)
										.map((id) => stopPoint(network, id)),
									estimatedMinutes: leg1Min,
									geometry: null,
								});
								const transferWalk = Math.max(
									hub.meters > 30 ? walkMinutes(hub.meters) : 2,
									2,
								);
								segments.push({
									kind: "transfer",
									fromStop: alight1,
									toStop: board2,
									walkMinutes: transferWalk,
								});
								const leg2Min = estimateMinutes(
									pattern2.offsets,
									secondBoard,
									alightIdx,
								);
								segments.push({
									kind: "transit",
									route: meta2,
									boardStop: board2,
									alightStop: alight2,
									intermediateStops: pattern2.stop_ids
										.slice(secondBoard + 1, alightIdx)
										.map((id) => stopPoint(network, id)),
									estimatedMinutes: leg2Min,
									geometry: null,
								});
								const walkOut = buildWalk(
									{
										latitude: alight2.latitude,
										longitude: alight2.longitude,
										name: alight2.name,
									},
									{
										stop_id: alight2.stop_id,
										name: destPoint.name,
										latitude: destPoint.latitude,
										longitude: destPoint.longitude,
									},
								);
								if (walkOut) segments.push(walkOut);

								const systemsDiffer = meta1.system !== meta2.system ? 40 : 0;
								const multimodal =
									(meta1.system === "zonal_urbano" ||
										meta1.system === "alimentador" ||
										meta2.system === "zonal_urbano" ||
										meta2.system === "alimentador") &&
									(meta1.system === "troncal" || meta2.system === "troncal")
										? 30
										: 0;
								const score =
									systemsDiffer + multimodal - (leg1Min + leg2Min + transferWalk) / 5;
								if (!best || score > best.score) {
									best = { score, segments };
								}
								if (best.score >= 80) return { segments: best.segments };
							}
						}
					}
				}
			}
		}
	}

	return best ? { segments: best.segments } : null;
}
