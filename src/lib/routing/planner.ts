import { CromaClient, getCromaClient } from "../croma/client";
import type { Stop, Alert } from "../croma/types";
import type { Route, RouteStop as PatternStop } from "../croma/types";
import {
	geocodeBogota,
	looksLikeBogotaAddress,
	looksLikeNeighborhood,
} from "../geocode/bogota";
import { haversineDistance, walkMinutes } from "../geo/haversine";
import { planRouteLocal } from "../network/local-planner";
import { loadNetworkBundle } from "../network/store";
import { namesLooselyMatch, scoreStopNameMatch } from "./name-match";
import type {
	RoutePlanRequest,
	RoutePlanResult,
	RoutePlanDebug,
	RoutePlanDebugStop,
	RouteSegment,
	WalkSegment,
	TransferSegment,
} from "./types";

const DEFAULT_MAX_WALK_METERS = 800;
/** Wider catch radius after geocoding an address/neighborhood. */
const GEOCODED_MAX_WALK_METERS = 1200;
const TRANSFER_WALK_METERS = 350;
const DEFAULT_MAX_TRANSFERS = 2;
const SAME_POINT_METERS = 120;

type ResolvedPoint = {
	latitude: number;
	longitude: number;
	name: string;
};

type ResolvedEndpoint = {
	point: ResolvedPoint;
	/** Candidate board/alight stops from name match or proximity search. */
	stops: Stop[];
	source: "name" | "coordinates";
};

function rankStopsByQuery(stops: Stop[], query: string): Stop[] {
	const ranked = [...stops]
		.map((stop) => ({
			stop,
			score: scoreStopNameMatch(
				{
					name: stop.name,
					kind: stop.kind,
					code: stop.code,
					systems: stop.systems,
				},
				query,
			),
		}))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);
	if (ranked.length === 0) return [];
	// Prefer strong textual matches; never fall back to "any station".
	const minScore = ranked[0].score >= 150 ? 100 : 40;
	return ranked.filter((x) => x.score >= minScore).map((x) => x.stop);
}

function debugStop(stop: Stop): RoutePlanDebugStop {
	return {
		stop_id: stop.stop_id,
		name: stop.name,
		kind: stop.kind,
		route_ids: stop.route_ids,
		route_codes: stop.route_codes,
		platforms: stop.platforms ?? [],
		parent_station: stop.parent_station,
	};
}

/** Collect station + platform + parent ids usable against pattern stop_ids. */
function collectMatchIds(candidates: Stop[]): Set<string> {
	const ids = new Set<string>();
	for (const stop of candidates) {
		ids.add(stop.stop_id);
		if (stop.parent_station) ids.add(stop.parent_station);
		for (const platformId of stop.platforms ?? []) {
			ids.add(platformId);
		}
	}
	return ids;
}

function collectCodeToIds(stops: Stop[]): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	for (const stop of stops) {
		if (stop.routes && stop.routes.length > 0) {
			for (const route of stop.routes) {
				const code = route.short_name?.toUpperCase();
				if (!code) continue;
				const set = map.get(code) ?? new Set<string>();
				set.add(route.route_id);
				map.set(code, set);
			}
			continue;
		}
		const n = Math.min(stop.route_ids.length, stop.route_codes.length);
		for (let i = 0; i < n; i++) {
			const code = stop.route_codes[i]?.toUpperCase();
			if (!code) continue;
			const set = map.get(code) ?? new Set<string>();
			set.add(stop.route_ids[i]);
			map.set(code, set);
		}
		for (let i = n; i < stop.route_ids.length; i++) {
			// ids without paired codes still participate via id intersection
		}
	}
	return map;
}

/** route_ids shared by id, plus both sides' ids for shared public codes. */
function candidateRouteIds(originStops: Stop[], destStops: Stop[]): {
	routeIds: string[];
	sharedIds: string[];
	sharedCodes: string[];
} {
	const originIds = new Set(originStops.flatMap((s) => s.route_ids));
	const destIds = new Set(destStops.flatMap((s) => s.route_ids));
	const sharedIds = [...originIds].filter((id) => destIds.has(id));

	const originCodes = collectCodeToIds(originStops);
	const destCodes = collectCodeToIds(destStops);
	const sharedCodes = [...originCodes.keys()].filter((code) =>
		destCodes.has(code),
	);

	const candidates = new Set<string>(sharedIds);
	for (const code of sharedCodes) {
		for (const id of originCodes.get(code) ?? []) candidates.add(id);
		for (const id of destCodes.get(code) ?? []) candidates.add(id);
	}

	return {
		routeIds: [...candidates],
		sharedIds,
		sharedCodes,
	};
}

function findStopIndexInPattern(
	patternStops: PatternStop[],
	candidates: Stop[],
): number {
	const ids = collectMatchIds(candidates);

	for (let i = 0; i < patternStops.length; i++) {
		if (ids.has(patternStops[i].stop_id)) return i;
	}
	for (let i = 0; i < patternStops.length; i++) {
		const name = patternStops[i].name;
		if (!name) continue;
		for (const stop of candidates) {
			if (namesLooselyMatch(name, stop.name)) return i;
		}
	}
	return -1;
}

function patternStopPoint(stop: PatternStop): {
	stop_id: string;
	name: string;
	latitude: number;
	longitude: number;
} {
	return {
		stop_id: stop.stop_id,
		name: stop.name ?? stop.stop_id,
		latitude: stop.latitude ?? 0,
		longitude: stop.longitude ?? 0,
	};
}

export class RoutePlanner {
	private client: CromaClient;

	constructor(client?: CromaClient) {
		this.client = client ?? getCromaClient();
	}

	async planRoute(request: RoutePlanRequest): Promise<RoutePlanResult> {
		const maxWalk = request.maxWalkMeters ?? DEFAULT_MAX_WALK_METERS;
		const maxTransfers = request.maxTransfers ?? DEFAULT_MAX_TRANSFERS;
		const limitations: string[] = [];
		const wantDebug = request.debug === true;
		const forceApi = request.forceApi === true;
		const debug: RoutePlanDebug = {
			originStops: [],
			destStops: [],
			sharedRouteIds: [],
			sharedRouteCodes: [],
			candidatesTried: [],
		};
		const withDebug = <T extends RoutePlanResult>(result: T): T => {
			if (!wantDebug) return result;
			return { ...result, debug };
		};

		if (!forceApi) {
			const bundle = loadNetworkBundle();
			if (bundle?.fresh) {
				const local = await planRouteLocal(bundle, request);
				if (local.kind === "success") {
					const alerts = await this.getRelevantAlerts(local.plan.segments);
					return withDebug({
						kind: "success",
						plan: {
							...local.plan,
							alerts,
							limitations: [
								...local.plan.limitations,
								...(wantDebug
									? ["planner=local_network"]
									: []),
							],
						},
					});
				}
				// Same-place rejection is definitive; other local misses fall through to live Croma.
				if (
					local.kind === "no_route" &&
					/same place/i.test(local.reason)
				) {
					return withDebug(local);
				}
			}
		}

		const origin = await this.resolveEndpoint(request.origin, maxWalk);
		if (!origin) {
			return withDebug({
				kind: "no_route",
				reason: "Could not resolve origin location",
			});
		}
		if (origin.stops.length === 0) {
			return withDebug({
				kind: "no_route",
				reason:
					origin.source === "name"
						? "No TransMilenio stop or station matched the origin name"
						: `No TransMilenio stations within ${maxWalk}m of origin`,
			});
		}

		const destination = await this.resolveEndpoint(
			request.destination,
			maxWalk,
		);
		if (!destination) {
			return withDebug({
				kind: "no_route",
				reason: "Could not resolve destination location",
			});
		}
		if (destination.stops.length === 0) {
			return withDebug({
				kind: "no_route",
				reason:
					destination.source === "name"
						? "No TransMilenio stop or station matched the destination name"
						: `No TransMilenio stations within ${maxWalk}m of destination`,
			});
		}

		const originStops = origin.stops;
		const destStops = destination.stops;
		const originCoords = origin.point;
		const destCoords = destination.point;
		debug.originStops = originStops.map(debugStop);
		debug.destStops = destStops.map(debugStop);

		const samePointMeters = haversineDistance(
			originCoords.latitude,
			originCoords.longitude,
			destCoords.latitude,
			destCoords.longitude,
		);
		if (samePointMeters < SAME_POINT_METERS) {
			return withDebug({
				kind: "no_route",
				reason: `Origin and destination resolved to the same place (${originCoords.name} ≈ ${destCoords.name}, ${Math.round(samePointMeters)}m apart). Try a more specific station name.`,
			});
		}

		const directRoute = await this.findDirectRoute(
			originStops,
			destStops,
			originCoords,
			destCoords,
			debug,
		);

		if (directRoute) {
			limitations.push(
				"This route uses a simplified algorithm based on shared routes between stops. " +
					"Actual travel times may vary based on traffic and service frequency.",
			);

			const alerts = await this.getRelevantAlerts(directRoute.segments);

			return withDebug({
				kind: "success",
				plan: {
					origin: originCoords,
					destination: destCoords,
					segments: directRoute.segments,
					totalMinutes: directRoute.totalMinutes,
					totalWalkMinutes: directRoute.totalWalkMinutes,
					transferCount: 0,
					alerts,
					timestamp: new Date().toISOString(),
					limitations,
				},
			});
		}

		if (maxTransfers > 0) {
			const transferRoute = await this.findTransferRoute(
				originStops,
				destStops,
				originCoords,
				destCoords,
				maxTransfers,
			);

			if (transferRoute) {
				limitations.push(
					"This route uses a simplified transfer algorithm. " +
						"The Croma API does not provide full graph-based routing, so this is a best-effort approximation. " +
						"Consider checking TransMilenio official sources for verified routes.",
				);

				const alerts = await this.getRelevantAlerts(transferRoute.segments);

				return withDebug({
					kind: "success",
					plan: {
						origin: originCoords,
						destination: destCoords,
						segments: transferRoute.segments,
						totalMinutes: transferRoute.totalMinutes,
						totalWalkMinutes: transferRoute.totalWalkMinutes,
						transferCount: transferRoute.transferCount,
						alerts,
						timestamp: new Date().toISOString(),
						limitations,
					},
				});
			}
		}

		return withDebug({
			kind: "no_route",
			reason:
				"No route found connecting origin and destination within the specified constraints. " +
				"Try increasing the walking distance or allowing more transfers.",
		});
	}

	/**
	 * Resolve a text or coordinate endpoint into a point plus candidate stops.
	 * Station/stop names use Croma search; addresses and neighborhoods geocode
	 * via Nominatim then load nearby stops of every Croma system.
	 */
	private async resolveEndpoint(
		location: RoutePlanRequest["origin"],
		maxWalkMeters: number,
	): Promise<ResolvedEndpoint | null> {
		if (location.latitude !== undefined && location.longitude !== undefined) {
			const point: ResolvedPoint = {
				latitude: location.latitude,
				longitude: location.longitude,
				name:
					location.text ??
					`${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
			};
			const stops = await this.searchNearbyStops(
				point.latitude,
				point.longitude,
				maxWalkMeters,
			);
			return {
				point,
				stops: await this.enrichStopsWithPlatforms(stops.slice(0, 15)),
				source: "coordinates",
			};
		}

		if (!location.text) {
			return null;
		}

		const query = location.text.trim();
		const preferGeocode =
			looksLikeBogotaAddress(query) || looksLikeNeighborhood(query);

		if (!preferGeocode) {
			const named = await this.resolveByStopName(query);
			if (named && named.stops.length > 0) {
				return named;
			}
		}

		const geocoded = await this.resolveByGeocode(query, maxWalkMeters);
		if (geocoded && geocoded.stops.length > 0) {
			return geocoded;
		}

		if (preferGeocode) {
			const named = await this.resolveByStopName(query);
			if (named && named.stops.length > 0) {
				return named;
			}
		}

		return geocoded;
	}

	private async resolveByStopName(query: string): Promise<ResolvedEndpoint | null> {
		const stationMatches = await this.client.searchStops({
			query,
			kind: "station",
			per_page: 20,
		});
		if (stationMatches.kind === "error") {
			return null;
		}

		let matches = stationMatches.data.data.stops;
		if (matches.length === 0) {
			const anyMatches = await this.client.searchStops({
				query,
				per_page: 20,
			});
			if (anyMatches.kind === "error") {
				return null;
			}
			matches = anyMatches.data.data.stops;
		}

		if (matches.length === 0) {
			return null;
		}

		const ranked = rankStopsByQuery(matches, query).slice(0, 10);
		if (ranked.length === 0) {
			return null;
		}
		const enriched = await this.enrichStopsWithPlatforms(ranked);
		const primary = enriched[0];
		return {
			point: {
				latitude: primary.latitude,
				longitude: primary.longitude,
				name: primary.name,
			},
			stops: enriched,
			source: "name",
		};
	}

	private async resolveByGeocode(
		query: string,
		maxWalkMeters: number,
	): Promise<ResolvedEndpoint | null> {
		const geo = await geocodeBogota(query);
		if (geo.kind === "error" || geo.kind === "not_found") {
			return null;
		}

		const radius = Math.max(maxWalkMeters, GEOCODED_MAX_WALK_METERS);
		const point: ResolvedPoint = {
			latitude: geo.point.latitude,
			longitude: geo.point.longitude,
			name: geo.point.displayName || query,
		};
		const stops = await this.searchNearbyStops(
			point.latitude,
			point.longitude,
			radius,
		);
		return {
			point,
			stops: await this.enrichStopsWithPlatforms(stops.slice(0, 15)),
			source: "coordinates",
		};
	}

	/** Nearby stops of every system (stations first, then any kind). */
	private async searchNearbyStops(
		latitude: number,
		longitude: number,
		radiusMeters: number,
	): Promise<Stop[]> {
		const stations = await this.client.searchStops({
			latitude,
			longitude,
			radius_m: radiusMeters,
			kind: "station",
			per_page: 20,
		});
		const anyStops = await this.client.searchStops({
			latitude,
			longitude,
			radius_m: radiusMeters,
			per_page: 20,
		});

		const byId = new Map<string, Stop>();
		if (stations.kind === "success") {
			for (const stop of stations.data.data.stops) {
				byId.set(stop.stop_id, stop);
			}
		}
		if (anyStops.kind === "success") {
			for (const stop of anyStops.data.data.stops) {
				if (!byId.has(stop.stop_id)) {
					byId.set(stop.stop_id, stop);
				}
			}
		}
		return [...byId.values()];
	}

	/**
	 * Pattern stop_ids are platforms. Stations from search may omit platforms;
	 * hydrate via stop/v1 so matching can use platform ids.
	 */
	private async enrichStopsWithPlatforms(stops: Stop[]): Promise<Stop[]> {
		const out: Stop[] = [];
		for (const stop of stops) {
			if (
				stop.kind === "station" &&
				(!stop.platforms || stop.platforms.length === 0)
			) {
				const detail = await this.client.getStop(stop.stop_id);
				if (
					detail.kind === "success" &&
					detail.data.data.stop &&
					detail.data.data.stop.platforms &&
					detail.data.data.stop.platforms.length > 0
				) {
					out.push({
						...stop,
						...detail.data.data.stop,
						// Keep search ranking fields that detail may omit.
						distance_m: stop.distance_m ?? detail.data.data.stop.distance_m,
					});
					continue;
				}
			}
			out.push(stop);
		}
		return out;
	}

	private async findDirectRoute(
		originStops: Stop[],
		destStops: Stop[],
		originCoords: { latitude: number; longitude: number; name: string },
		destCoords: { latitude: number; longitude: number; name: string },
		debug: RoutePlanDebug,
	): Promise<{
		segments: (WalkSegment | RouteSegment)[];
		totalMinutes: number;
		totalWalkMinutes: number;
	} | null> {
		const { routeIds, sharedIds, sharedCodes } = candidateRouteIds(
			originStops,
			destStops,
		);
		debug.sharedRouteIds = sharedIds;
		debug.sharedRouteCodes = sharedCodes;

		const codeById = new Map<string, string>();
		for (const stop of [...originStops, ...destStops]) {
			if (stop.routes) {
				for (const route of stop.routes) {
					if (route.short_name) {
						codeById.set(route.route_id, route.short_name.toUpperCase());
					}
				}
			}
			const n = Math.min(stop.route_ids.length, stop.route_codes.length);
			for (let i = 0; i < n; i++) {
				codeById.set(stop.route_ids[i], stop.route_codes[i].toUpperCase());
			}
		}

		for (const routeId of routeIds) {
			const routeCode = codeById.get(routeId) ?? null;
			// Match without geometry first (smaller payload); hydrate geometry on hit.
			let routeResult = await this.client.getRoute(routeId, false);
			if (routeResult.kind === "error") {
				debug.candidatesTried.push({
					route_id: routeId,
					route_code: routeCode,
					outcome: `getRoute error: ${routeResult.message}`,
				});
				continue;
			}
			if (!routeResult.data.data.route) {
				debug.candidatesTried.push({
					route_id: routeId,
					route_code: routeCode,
					outcome: "getRoute found=false",
				});
				continue;
			}

			let route = routeResult.data.data.route;
			let patterns = route.patterns ?? [];
			if (patterns.length === 0) {
				debug.candidatesTried.push({
					route_id: routeId,
					route_code: routeCode ?? route.short_name,
					outcome: "route has no patterns",
				});
				continue;
			}

			for (let p = 0; p < patterns.length; p++) {
				const pattern = patterns[p];
				const boardIdx = findStopIndexInPattern(pattern.stops, originStops);
				const alightIdx = findStopIndexInPattern(pattern.stops, destStops);
				if (boardIdx === -1 || alightIdx === -1) {
					debug.candidatesTried.push({
						route_id: routeId,
						route_code: routeCode ?? route.short_name,
						outcome: `pattern stops missing endpoints (board=${boardIdx}, alight=${alightIdx}, stops=${pattern.stops.length}, originIds=${[...collectMatchIds(originStops)].slice(0, 8).join("|")}, destIds=${[...collectMatchIds(destStops)].slice(0, 8).join("|")})`,
					});
					continue;
				}
				if (boardIdx >= alightIdx) {
					debug.candidatesTried.push({
						route_id: routeId,
						route_code: routeCode ?? route.short_name,
						outcome: `wrong direction (board seq ${boardIdx} >= alight ${alightIdx})`,
					});
					continue;
				}

				let geometry = pattern.geometry?.coordinates ?? null;
				if (!geometry) {
					const withGeom = await this.client.getRoute(routeId, true);
					if (
						withGeom.kind === "success" &&
						withGeom.data.data.route?.patterns?.[p]?.geometry?.coordinates
					) {
						route = withGeom.data.data.route;
						patterns = route.patterns ?? patterns;
						geometry =
							patterns[p]?.geometry?.coordinates ?? null;
					}
				}

				const boardPatternStop = (patterns[p] ?? pattern).stops[boardIdx];
				const alightPatternStop = (patterns[p] ?? pattern).stops[alightIdx];
				const boardStop = patternStopPoint(boardPatternStop);
				const alightStop = patternStopPoint(alightPatternStop);
				const patternStops = (patterns[p] ?? pattern).stops;

				const built = this.buildDirectSegments({
					route,
					patternStops,
					boardIdx,
					alightIdx,
					boardStop,
					alightStop,
					originCoords,
					destCoords,
					geometry,
				});

				debug.candidatesTried.push({
					route_id: routeId,
					route_code: routeCode ?? route.short_name,
					outcome: `matched board=${boardStop.stop_id} alight=${alightStop.stop_id}`,
				});
				return built;
			}
		}

		return null;
	}

	private buildDirectSegments(args: {
		route: Route;
		patternStops: PatternStop[];
		boardIdx: number;
		alightIdx: number;
		boardStop: {
			stop_id: string;
			name: string;
			latitude: number;
			longitude: number;
		};
		alightStop: {
			stop_id: string;
			name: string;
			latitude: number;
			longitude: number;
		};
		originCoords: { latitude: number; longitude: number; name: string };
		destCoords: { latitude: number; longitude: number; name: string };
		geometry: number[][] | null;
	}): {
		segments: (WalkSegment | RouteSegment)[];
		totalMinutes: number;
		totalWalkMinutes: number;
	} {
		const {
			route,
			patternStops,
			boardIdx,
			alightIdx,
			boardStop,
			alightStop,
			originCoords,
			destCoords,
			geometry,
		} = args;

		const walkToOrigin = haversineDistance(
			originCoords.latitude,
			originCoords.longitude,
			boardStop.latitude,
			boardStop.longitude,
		);
		const walkFromDest = haversineDistance(
			alightStop.latitude,
			alightStop.longitude,
			destCoords.latitude,
			destCoords.longitude,
		);
		const walkToOriginMin = walkMinutes(walkToOrigin);
		const walkFromDestMin = walkMinutes(walkFromDest);
		const transitMinutes = this.estimateTransitTime(
			patternStops,
			boardIdx,
			alightIdx,
		);
		const intermediateStops = patternStops
			.slice(boardIdx + 1, alightIdx)
			.map(patternStopPoint);

		const segments: (WalkSegment | RouteSegment)[] = [];
		if (walkToOrigin > 50) {
			segments.push({
				kind: "walk",
				from: {
					latitude: originCoords.latitude,
					longitude: originCoords.longitude,
					name: originCoords.name,
				},
				to: boardStop,
				distanceMeters: Math.round(walkToOrigin),
				estimatedMinutes: walkToOriginMin,
			});
		}

		segments.push({
			kind: "transit",
			route: {
				route_id: route.route_id,
				short_name: route.short_name,
				long_name: route.long_name,
				system: route.system,
				color: route.color,
			},
			boardStop,
			alightStop,
			intermediateStops,
			estimatedMinutes: transitMinutes,
			geometry: geometry
				? geometry.map((coord) => [coord[0], coord[1]] as [number, number])
				: null,
		});

		if (walkFromDest > 50) {
			segments.push({
				kind: "walk",
				from: {
					latitude: alightStop.latitude,
					longitude: alightStop.longitude,
					name: alightStop.name,
				},
				to: {
					stop_id: alightStop.stop_id,
					name: destCoords.name,
					latitude: destCoords.latitude,
					longitude: destCoords.longitude,
				},
				distanceMeters: Math.round(walkFromDest),
				estimatedMinutes: walkFromDestMin,
			});
		}

		return {
			segments,
			totalMinutes: walkToOriginMin + transitMinutes + walkFromDestMin,
			totalWalkMinutes: walkToOriginMin + walkFromDestMin,
		};
	}

	private async findTransferRoute(
		originStops: Stop[],
		destStops: Stop[],
		originCoords: { latitude: number; longitude: number; name: string },
		destCoords: { latitude: number; longitude: number; name: string },
		_maxTransfers: number,
	): Promise<{
		segments: (WalkSegment | RouteSegment | TransferSegment)[];
		totalMinutes: number;
		totalWalkMinutes: number;
		transferCount: number;
	} | null> {
		type Built = {
			segments: (WalkSegment | RouteSegment | TransferSegment)[];
			totalMinutes: number;
			totalWalkMinutes: number;
			transferCount: number;
			score: number;
		};
		const state: { best: Built | null } = { best: null };

		for (const originStop of originStops.slice(0, 8)) {
			for (const originRouteId of originStop.route_ids.slice(0, 4)) {
				const originRouteResult = await this.client.getRoute(
					originRouteId,
					false,
				);
				if (
					originRouteResult.kind !== "success" ||
					!originRouteResult.data.data.route
				) {
					continue;
				}
				const originRoute = originRouteResult.data.data.route;
				const patterns = originRoute.patterns ?? [];
				for (const originPattern of patterns.slice(0, 2)) {
					const boardIdx = findStopIndexInPattern(originPattern.stops, [
						originStop,
						...originStops,
					]);
					if (boardIdx === -1) continue;

					const step = Math.max(
						1,
						Math.floor((originPattern.stops.length - boardIdx) / 12),
					);
					for (
						let transferIdx = boardIdx + 1;
						transferIdx < originPattern.stops.length;
						transferIdx += step
					) {
						const transferStopData = originPattern.stops[transferIdx];
						const hubs = await this.collectTransferHubs(transferStopData);
						for (const hub of hubs) {
							const connectingIds = candidateRouteIds([hub.stop], destStops)
								.routeIds.filter((id) => id !== originRouteId)
								.slice(0, 4);

							for (const connectingId of connectingIds) {
								const built = await this.buildTwoLegTransfer({
									originRoute,
									originPatternStops: originPattern.stops,
									boardIdx,
									transferIdx,
									transferAlight: patternStopPoint(transferStopData),
									hubStop: hub.stop,
									hubWalkMeters: hub.walkMeters,
									connectingId,
									destStops,
									originCoords,
									destCoords,
								});
								if (
									built &&
									(!state.best || built.score > state.best.score)
								) {
									state.best = built;
								}
								if (state.best && state.best.score >= 80) {
									return {
										segments: state.best.segments,
										totalMinutes: state.best.totalMinutes,
										totalWalkMinutes: state.best.totalWalkMinutes,
										transferCount: state.best.transferCount,
									};
								}
							}
						}
					}
				}
			}
		}

		return state.best
			? {
					segments: state.best.segments,
					totalMinutes: state.best.totalMinutes,
					totalWalkMinutes: state.best.totalWalkMinutes,
					transferCount: state.best.transferCount,
				}
			: null;
	}

	/**
	 * Transfer hub = the pattern stop itself plus nearby stops (other systems)
	 * within TRANSFER_WALK_METERS for multimodal walk transfers.
	 */
	private async collectTransferHubs(
		transferStopData: PatternStop,
	): Promise<Array<{ stop: Stop; walkMeters: number }>> {
		const hubs: Array<{ stop: Stop; walkMeters: number }> = [];
		const seen = new Set<string>();

		const detail = await this.client.getStop(transferStopData.stop_id);
		if (detail.kind === "success" && detail.data.data.stop) {
			const stop = detail.data.data.stop;
			hubs.push({ stop, walkMeters: 0 });
			seen.add(stop.stop_id);
		}

		const lat = transferStopData.latitude;
		const lon = transferStopData.longitude;
		if (lat == null || lon == null) {
			return hubs;
		}

		const nearby = await this.searchNearbyStops(
			lat,
			lon,
			TRANSFER_WALK_METERS,
		);
		for (const stop of nearby) {
			if (seen.has(stop.stop_id)) continue;
			seen.add(stop.stop_id);
			const walk = haversineDistance(lat, lon, stop.latitude, stop.longitude);
			if (walk <= TRANSFER_WALK_METERS) {
				hubs.push({ stop, walkMeters: walk });
			}
		}
		return hubs.slice(0, 6);
	}

	private async buildTwoLegTransfer(args: {
		originRoute: Route;
		originPatternStops: PatternStop[];
		boardIdx: number;
		transferIdx: number;
		transferAlight: {
			stop_id: string;
			name: string;
			latitude: number;
			longitude: number;
		};
		hubStop: Stop;
		hubWalkMeters: number;
		connectingId: string;
		destStops: Stop[];
		originCoords: { latitude: number; longitude: number; name: string };
		destCoords: { latitude: number; longitude: number; name: string };
	}): Promise<{
		segments: (WalkSegment | RouteSegment | TransferSegment)[];
		totalMinutes: number;
		totalWalkMinutes: number;
		transferCount: number;
		score: number;
	} | null> {
		const {
			originRoute,
			originPatternStops,
			boardIdx,
			transferIdx,
			transferAlight,
			hubStop,
			hubWalkMeters,
			connectingId,
			destStops,
			originCoords,
			destCoords,
		} = args;

		const connectingRouteResult = await this.client.getRoute(
			connectingId,
			false,
		);
		if (
			connectingRouteResult.kind !== "success" ||
			!connectingRouteResult.data.data.route
		) {
			return null;
		}
		const connectingRoute = connectingRouteResult.data.data.route;
		const connectingPattern = connectingRoute.patterns?.[0];
		if (!connectingPattern) return null;

		const secondBoardIdx = findStopIndexInPattern(connectingPattern.stops, [
			hubStop,
		]);
		const alightIdx = findStopIndexInPattern(
			connectingPattern.stops,
			destStops,
		);
		if (
			secondBoardIdx === -1 ||
			alightIdx === -1 ||
			secondBoardIdx >= alightIdx
		) {
			return null;
		}

		const boardStop = patternStopPoint(originPatternStops[boardIdx]);
		const secondBoard = patternStopPoint(
			connectingPattern.stops[secondBoardIdx],
		);
		const alightStop = patternStopPoint(connectingPattern.stops[alightIdx]);

		const walkToOrigin = haversineDistance(
			originCoords.latitude,
			originCoords.longitude,
			boardStop.latitude,
			boardStop.longitude,
		);
		const walkFromDest = haversineDistance(
			alightStop.latitude,
			alightStop.longitude,
			destCoords.latitude,
			destCoords.longitude,
		);
		const walkToOriginMin = walkMinutes(walkToOrigin);
		const walkFromDestMin = walkMinutes(walkFromDest);
		const transferWalkMin = Math.max(
			hubWalkMeters > 30 ? walkMinutes(hubWalkMeters) : 2,
			2,
		);
		const firstLegMinutes = this.estimateTransitTime(
			originPatternStops,
			boardIdx,
			transferIdx,
		);
		const secondLegMinutes = this.estimateTransitTime(
			connectingPattern.stops,
			secondBoardIdx,
			alightIdx,
		);

		const segments: (WalkSegment | RouteSegment | TransferSegment)[] = [];
		if (walkToOrigin > 50) {
			segments.push({
				kind: "walk",
				from: {
					latitude: originCoords.latitude,
					longitude: originCoords.longitude,
					name: originCoords.name,
				},
				to: boardStop,
				distanceMeters: Math.round(walkToOrigin),
				estimatedMinutes: walkToOriginMin,
			});
		}
		segments.push({
			kind: "transit",
			route: {
				route_id: originRoute.route_id,
				short_name: originRoute.short_name,
				long_name: originRoute.long_name,
				system: originRoute.system,
				color: originRoute.color,
			},
			boardStop,
			alightStop: transferAlight,
			intermediateStops: originPatternStops
				.slice(boardIdx + 1, transferIdx)
				.map(patternStopPoint),
			estimatedMinutes: firstLegMinutes,
			geometry: null,
		});
		segments.push({
			kind: "transfer",
			fromStop: transferAlight,
			toStop: secondBoard,
			walkMinutes: transferWalkMin,
		});
		segments.push({
			kind: "transit",
			route: {
				route_id: connectingRoute.route_id,
				short_name: connectingRoute.short_name,
				long_name: connectingRoute.long_name,
				system: connectingRoute.system,
				color: connectingRoute.color,
			},
			boardStop: secondBoard,
			alightStop,
			intermediateStops: connectingPattern.stops
				.slice(secondBoardIdx + 1, alightIdx)
				.map(patternStopPoint),
			estimatedMinutes: secondLegMinutes,
			geometry: null,
		});
		if (walkFromDest > 50) {
			segments.push({
				kind: "walk",
				from: {
					latitude: alightStop.latitude,
					longitude: alightStop.longitude,
					name: alightStop.name,
				},
				to: {
					stop_id: alightStop.stop_id,
					name: destCoords.name,
					latitude: destCoords.latitude,
					longitude: destCoords.longitude,
				},
				distanceMeters: Math.round(walkFromDest),
				estimatedMinutes: walkFromDestMin,
			});
		}

		const systemsDiffer =
			originRoute.system !== connectingRoute.system ? 40 : 0;
		const multimodalBonus =
			(originRoute.system === "zonal_urbano" ||
				originRoute.system === "alimentador" ||
				connectingRoute.system === "zonal_urbano" ||
				connectingRoute.system === "alimentador") &&
			(originRoute.system === "troncal" || connectingRoute.system === "troncal")
				? 30
				: 0;
		const durationPenalty = Math.min(
			walkToOriginMin +
				firstLegMinutes +
				transferWalkMin +
				secondLegMinutes +
				walkFromDestMin,
			60,
		);

		return {
			segments,
			totalMinutes:
				walkToOriginMin +
				firstLegMinutes +
				transferWalkMin +
				secondLegMinutes +
				walkFromDestMin,
			totalWalkMinutes:
				walkToOriginMin +
				(hubWalkMeters > 30 ? walkMinutes(hubWalkMeters) : 0) +
				walkFromDestMin,
			transferCount: 1,
			score: systemsDiffer + multimodalBonus - durationPenalty / 5,
		};
	}

	private estimateTransitTime(
		patternStops: PatternStop[],
		fromIdx: number,
		toIdx: number,
	): number {
		if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) {
			return 15;
		}

		const fromOffset = patternStops[fromIdx].offset_seconds;
		const toOffset = patternStops[toIdx].offset_seconds;
		if (fromOffset != null && toOffset != null) {
			return Math.max(Math.round((toOffset - fromOffset) / 60), 1);
		}

		const fromMinutes = patternStops[fromIdx].minutes ?? 0;
		const toMinutes = patternStops[toIdx].minutes;
		if (toMinutes != null) {
			return Math.max(toMinutes - fromMinutes, 1);
		}

		return Math.max((toIdx - fromIdx) * 2, 1);
	}

	private async getRelevantAlerts(
		segments: (WalkSegment | RouteSegment | TransferSegment)[],
	): Promise<Alert[]> {
		const routeIds = new Set<string>();
		const stopIds = new Set<string>();

		for (const segment of segments) {
			if (segment.kind === "transit") {
				routeIds.add(segment.route.route_id);
				stopIds.add(segment.boardStop.stop_id);
				stopIds.add(segment.alightStop.stop_id);
			} else if (segment.kind === "transfer") {
				stopIds.add(segment.fromStop.stop_id);
				stopIds.add(segment.toStop.stop_id);
			}
		}

		const alerts: Alert[] = [];
		const seenAlertIds = new Set<string>();

		for (const routeId of routeIds) {
			const result = await this.client.getAlerts({ route: routeId });
			if (result.kind === "success") {
				for (const alert of result.data.data.alerts) {
					if (!seenAlertIds.has(alert.alert_id)) {
						seenAlertIds.add(alert.alert_id);
						alerts.push(alert);
					}
				}
			}
		}

		return alerts;
	}
}

export function createRoutePlanner(client?: CromaClient): RoutePlanner {
	return new RoutePlanner(client);
}
