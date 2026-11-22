import { CromaClient, getCromaClient } from "../croma/client";
import type { Stop, Alert } from "../croma/types";
import type {
	RoutePlanRequest,
	RoutePlanResult,
	RouteSegment,
	WalkSegment,
	TransferSegment,
} from "./types";

const WALK_SPEED_KMH = 4.5;
const DEFAULT_MAX_WALK_METERS = 800;
const DEFAULT_MAX_TRANSFERS = 2;

function haversineDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function walkMinutes(distanceMeters: number): number {
	return Math.ceil((distanceMeters / 1000 / WALK_SPEED_KMH) * 60);
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

		const originCoords = await this.resolveLocation(request.origin);
		if (!originCoords) {
			return { kind: "no_route", reason: "Could not resolve origin location" };
		}

		const destCoords = await this.resolveLocation(request.destination);
		if (!destCoords) {
			return { kind: "no_route", reason: "Could not resolve destination location" };
		}

		const originStopsResult = await this.client.searchStops({
			latitude: originCoords.latitude,
			longitude: originCoords.longitude,
			radius_m: maxWalk,
			kind: "station",
			per_page: 20,
		});

		if (originStopsResult.kind === "error") {
			return { kind: "error", message: originStopsResult.message };
		}

		const destStopsResult = await this.client.searchStops({
			latitude: destCoords.latitude,
			longitude: destCoords.longitude,
			radius_m: maxWalk,
			kind: "station",
			per_page: 20,
		});

		if (destStopsResult.kind === "error") {
			return { kind: "error", message: destStopsResult.message };
		}

		const originStops = originStopsResult.data.data.stops;
		const destStops = destStopsResult.data.data.stops;

		if (originStops.length === 0) {
			return {
				kind: "no_route",
				reason: `No TransMilenio stations within ${maxWalk}m of origin`,
			};
		}

		if (destStops.length === 0) {
			return {
				kind: "no_route",
				reason: `No TransMilenio stations within ${maxWalk}m of destination`,
			};
		}

		const directRoute = await this.findDirectRoute(
			originStops,
			destStops,
			originCoords,
			destCoords,
		);

		if (directRoute) {
			limitations.push(
				"This route uses a simplified algorithm based on shared routes between stops. " +
				"Actual travel times may vary based on traffic and service frequency.",
			);

			const alerts = await this.getRelevantAlerts(directRoute.segments);

			return {
				kind: "success",
				plan: {
					origin: {
						latitude: originCoords.latitude,
						longitude: originCoords.longitude,
						name: originCoords.name,
					},
					destination: {
						latitude: destCoords.latitude,
						longitude: destCoords.longitude,
						name: destCoords.name,
					},
					segments: directRoute.segments,
					totalMinutes: directRoute.totalMinutes,
					totalWalkMinutes: directRoute.totalWalkMinutes,
					transferCount: 0,
					alerts,
					timestamp: new Date().toISOString(),
					limitations,
				},
			};
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

				return {
					kind: "success",
					plan: {
						origin: {
							latitude: originCoords.latitude,
							longitude: originCoords.longitude,
							name: originCoords.name,
						},
						destination: {
							latitude: destCoords.latitude,
							longitude: destCoords.longitude,
							name: destCoords.name,
						},
						segments: transferRoute.segments,
						totalMinutes: transferRoute.totalMinutes,
						totalWalkMinutes: transferRoute.totalWalkMinutes,
						transferCount: transferRoute.transferCount,
						alerts,
						timestamp: new Date().toISOString(),
						limitations,
					},
				};
			}
		}

		return {
			kind: "no_route",
			reason:
				"No route found connecting origin and destination within the specified constraints. " +
				"Try increasing the walking distance or allowing more transfers.",
		};
	}

	private async resolveLocation(
		location: RoutePlanRequest["origin"],
	): Promise<{ latitude: number; longitude: number; name: string } | null> {
		if (location.latitude !== undefined && location.longitude !== undefined) {
			return {
				latitude: location.latitude,
				longitude: location.longitude,
				name: location.text ?? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
			};
		}

		if (location.text) {
			const result = await this.client.searchStops({
				query: location.text,
				per_page: 1,
			});

			if (result.kind === "success" && result.data.data.stops.length > 0) {
				const stop = result.data.data.stops[0];
				return {
					latitude: stop.latitude,
					longitude: stop.longitude,
					name: stop.name,
				};
			}
		}

		return null;
	}

	private async findDirectRoute(
		originStops: Stop[],
		destStops: Stop[],
		originCoords: { latitude: number; longitude: number; name: string },
		destCoords: { latitude: number; longitude: number; name: string },
	): Promise<{
		segments: (WalkSegment | RouteSegment)[];
		totalMinutes: number;
		totalWalkMinutes: number;
	} | null> {
		for (const originStop of originStops) {
			for (const destStop of destStops) {
				const sharedRoutes = originStop.route_ids.filter((id) =>
					destStop.route_ids.includes(id),
				);

				if (sharedRoutes.length > 0) {
					const routeResult = await this.client.getRoute(sharedRoutes[0], true);
					if (routeResult.kind !== "success" || !routeResult.data.data.route) {
						continue;
					}

					const route = routeResult.data.data.route;
					const pattern = route.patterns?.[0];
					
					const walkToOrigin = haversineDistance(
						originCoords.latitude,
						originCoords.longitude,
						originStop.latitude,
						originStop.longitude,
					);
					const walkFromDest = haversineDistance(
						destStop.latitude,
						destStop.longitude,
						destCoords.latitude,
						destCoords.longitude,
					);

					const walkToOriginMin = walkMinutes(walkToOrigin);
					const walkFromDestMin = walkMinutes(walkFromDest);

					const intermediateStops = this.getIntermediateStops(
						pattern?.stops ?? [],
						originStop.stop_id,
						destStop.stop_id,
					);

					const transitMinutes = this.estimateTransitTime(
						pattern?.stops ?? [],
						originStop.stop_id,
						destStop.stop_id,
					);

					const segments: (WalkSegment | RouteSegment)[] = [];

					if (walkToOrigin > 50) {
						segments.push({
							kind: "walk",
							from: {
								latitude: originCoords.latitude,
								longitude: originCoords.longitude,
								name: originCoords.name,
							},
							to: {
								stop_id: originStop.stop_id,
								name: originStop.name,
								latitude: originStop.latitude,
								longitude: originStop.longitude,
							},
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
						boardStop: {
							stop_id: originStop.stop_id,
							name: originStop.name,
							latitude: originStop.latitude,
							longitude: originStop.longitude,
						},
						alightStop: {
							stop_id: destStop.stop_id,
							name: destStop.name,
							latitude: destStop.latitude,
							longitude: destStop.longitude,
						},
						intermediateStops,
						estimatedMinutes: transitMinutes,
						geometry: pattern?.geometry?.coordinates ?? null,
					});

					if (walkFromDest > 50) {
						segments.push({
							kind: "walk",
							from: {
								latitude: destStop.latitude,
								longitude: destStop.longitude,
								name: destStop.name,
							},
							to: {
								stop_id: destStop.stop_id,
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
			}
		}

		return null;
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
		for (const originStop of originStops) {
			for (const originRouteId of originStop.route_ids.slice(0, 3)) {
				const originRouteResult = await this.client.getRoute(originRouteId, false);
				if (originRouteResult.kind !== "success" || !originRouteResult.data.data.route) {
					continue;
				}
				const originRoute = originRouteResult.data.data.route;
				const originPattern = originRoute.patterns?.[0];
				if (!originPattern) continue;

				for (const transferStopData of originPattern.stops) {
					const transferStopResult = await this.client.getStop(transferStopData.stop_id);
					if (transferStopResult.kind !== "success" || !transferStopResult.data.data.stop) {
						continue;
					}
					const transferStop = transferStopResult.data.data.stop;

					for (const destStop of destStops) {
						const connectingRoutes = transferStop.route_ids.filter(
							(id) => destStop.route_ids.includes(id) && id !== originRouteId,
						);

						if (connectingRoutes.length > 0) {
							const connectingRouteResult = await this.client.getRoute(
								connectingRoutes[0],
								true,
							);
							if (
								connectingRouteResult.kind !== "success" ||
								!connectingRouteResult.data.data.route
							) {
								continue;
							}

							const connectingRoute = connectingRouteResult.data.data.route;
							const connectingPattern = connectingRoute.patterns?.[0];

							const walkToOrigin = haversineDistance(
								originCoords.latitude,
								originCoords.longitude,
								originStop.latitude,
								originStop.longitude,
							);
							const walkFromDest = haversineDistance(
								destStop.latitude,
								destStop.longitude,
								destCoords.latitude,
								destCoords.longitude,
							);

							const walkToOriginMin = walkMinutes(walkToOrigin);
							const walkFromDestMin = walkMinutes(walkFromDest);

							const firstLegMinutes = this.estimateTransitTime(
								originPattern.stops,
								originStop.stop_id,
								transferStop.stop_id,
							);
							const secondLegMinutes = this.estimateTransitTime(
								connectingPattern?.stops ?? [],
								transferStop.stop_id,
								destStop.stop_id,
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
									to: {
										stop_id: originStop.stop_id,
										name: originStop.name,
										latitude: originStop.latitude,
										longitude: originStop.longitude,
									},
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
								boardStop: {
									stop_id: originStop.stop_id,
									name: originStop.name,
									latitude: originStop.latitude,
									longitude: originStop.longitude,
								},
								alightStop: {
									stop_id: transferStop.stop_id,
									name: transferStop.name,
									latitude: transferStop.latitude,
									longitude: transferStop.longitude,
								},
								intermediateStops: this.getIntermediateStops(
									originPattern.stops,
									originStop.stop_id,
									transferStop.stop_id,
								),
								estimatedMinutes: firstLegMinutes,
								geometry: null,
							});

							segments.push({
								kind: "transfer",
								fromStop: {
									stop_id: transferStop.stop_id,
									name: transferStop.name,
									latitude: transferStop.latitude,
									longitude: transferStop.longitude,
								},
								toStop: {
									stop_id: transferStop.stop_id,
									name: transferStop.name,
									latitude: transferStop.latitude,
									longitude: transferStop.longitude,
								},
								walkMinutes: 3,
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
								boardStop: {
									stop_id: transferStop.stop_id,
									name: transferStop.name,
									latitude: transferStop.latitude,
									longitude: transferStop.longitude,
								},
								alightStop: {
									stop_id: destStop.stop_id,
									name: destStop.name,
									latitude: destStop.latitude,
									longitude: destStop.longitude,
								},
								intermediateStops: this.getIntermediateStops(
									connectingPattern?.stops ?? [],
									transferStop.stop_id,
									destStop.stop_id,
								),
								estimatedMinutes: secondLegMinutes,
								geometry: connectingPattern?.geometry?.coordinates ?? null,
							});

							if (walkFromDest > 50) {
								segments.push({
									kind: "walk",
									from: {
										latitude: destStop.latitude,
										longitude: destStop.longitude,
										name: destStop.name,
									},
									to: {
										stop_id: destStop.stop_id,
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
								totalMinutes:
									walkToOriginMin +
									firstLegMinutes +
									3 +
									secondLegMinutes +
									walkFromDestMin,
								totalWalkMinutes: walkToOriginMin + walkFromDestMin,
								transferCount: 1,
							};
						}
					}
				}
			}
		}

		return null;
	}

	private getIntermediateStops(
		patternStops: Array<{ stop_id: string; name: string; latitude: number; longitude: number }>,
		fromStopId: string,
		toStopId: string,
	): Array<{ stop_id: string; name: string; latitude: number; longitude: number }> {
		const fromIdx = patternStops.findIndex((s) => s.stop_id === fromStopId);
		const toIdx = patternStops.findIndex((s) => s.stop_id === toStopId);

		if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) {
			return [];
		}

		return patternStops.slice(fromIdx + 1, toIdx).map((s) => ({
			stop_id: s.stop_id,
			name: s.name,
			latitude: s.latitude,
			longitude: s.longitude,
		}));
	}

	private estimateTransitTime(
		patternStops: Array<{ stop_id: string; minutes: number | null }>,
		fromStopId: string,
		toStopId: string,
	): number {
		const fromIdx = patternStops.findIndex((s) => s.stop_id === fromStopId);
		const toIdx = patternStops.findIndex((s) => s.stop_id === toStopId);

		if (fromIdx === -1 || toIdx === -1) {
			return 15;
		}

		const fromMinutes = patternStops[fromIdx].minutes ?? 0;
		const toMinutes = patternStops[toIdx].minutes;

		if (toMinutes !== null) {
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
