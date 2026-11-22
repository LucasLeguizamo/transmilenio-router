import { describe, it, expect, vi } from "vitest";
import { RoutePlanner } from "../src/lib/routing/planner";
import type { CromaClient } from "../src/lib/croma/client";
import type { Stop, Route } from "../src/lib/croma/types";
import { isSuccessfulMultimodalPlanRouteResult } from "../src/lib/mcp/result";

function stop(
	partial: Partial<Stop> & Pick<Stop, "stop_id" | "name" | "route_ids" | "route_codes">,
): Stop {
	return {
		code: null,
		kind: "stop",
		parent_station: null,
		latitude: 4.66,
		longitude: -74.06,
		wheelchair_boarding: null,
		zone_id: null,
		platforms: [],
		...partial,
	};
}

function routePayload(
	route: Partial<Route> &
		Pick<Route, "route_id" | "short_name" | "system" | "patterns">,
) {
	return {
		kind: "success" as const,
		data: {
			data: {
				as_of: null,
				found: true,
				route_id: route.route_id,
				route: {
					long_name: route.long_name ?? route.short_name,
					system_name: route.system,
					mode: "bus" as const,
					color: null,
					text_color: null,
					stops_count: route.patterns?.[0]?.stops.length ?? 0,
					trips_per_week: 100,
					first_departure: "05:00:00",
					last_departure: "22:00:00",
					services: [],
					headways: [],
					origin: null,
					destination: null,
					hours: null,
					...route,
				},
			},
		},
	};
}

describe("multimodal transfer planning", () => {
	it("returns zonal_urbano + troncal legs with a walking transfer", async () => {
		const zonalStop = stop({
			stop_id: "sitp-76",
			name: "Calle 76 / Cr 20",
			latitude: 4.664,
			longitude: -74.0605,
			route_ids: ["zonal-466"],
			route_codes: ["466"],
			routes: [
				{
					route_id: "zonal-466",
					short_name: "466",
					long_name: "Portal Norte",
					system: "zonal_urbano",
				},
			],
			systems: ["zonal_urbano"],
		});
		const tmAlight = stop({
			stop_id: "sitp-calle100",
			name: "Calle 100 SITP",
			latitude: 4.6855,
			longitude: -74.0545,
			route_ids: ["zonal-466"],
			route_codes: ["466"],
			systems: ["zonal_urbano"],
		});
		const tmStation = stop({
			stop_id: "55007",
			name: "Calle 100",
			kind: "station",
			latitude: 4.6862,
			longitude: -74.0552,
			route_ids: ["r-b907-n"],
			route_codes: ["B907"],
			platforms: ["56001"],
			routes: [
				{
					route_id: "r-b907-n",
					short_name: "B907",
					long_name: "Portal del Norte",
					system: "troncal",
				},
			],
			systems: ["troncal"],
		});
		const portal = stop({
			stop_id: "55770",
			name: "Portal del Norte",
			kind: "station",
			latitude: 4.7616,
			longitude: -74.0463,
			route_ids: ["r-b907-n"],
			route_codes: ["B907"],
			platforms: ["56496"],
			systems: ["troncal"],
		});

		const searchStops = vi.fn(async (params: {
			latitude?: number;
			longitude?: number;
			kind?: string;
			radius_m?: number;
		}) => {
			const nearOrigin =
				params.latitude != null &&
				params.latitude < 4.67 &&
				params.longitude != null;
			const nearDest =
				params.latitude != null && params.latitude > 4.72;
			const nearTransfer =
				params.latitude != null &&
				params.latitude > 4.68 &&
				params.latitude < 4.7;

			let stops: Stop[] = [];
			if (nearOrigin) stops = [zonalStop];
			else if (nearDest) stops = [portal];
			else if (nearTransfer) stops = [tmStation, tmAlight];

			if (params.kind === "station") {
				stops = stops.filter((s) => s.kind === "station");
			}

			return {
				kind: "success" as const,
				data: {
					data: {
						as_of: null,
						total: stops.length,
						total_is_exact: true,
						page: 1,
						per_page: 20,
						total_pages: 1,
						count: stops.length,
						stops,
					},
				},
			};
		});

		const getStop = vi.fn(async (stopId: string) => {
			const map: Record<string, Stop> = {
				"sitp-76": zonalStop,
				"sitp-calle100": tmAlight,
				"55007": tmStation,
				"55770": portal,
			};
			return {
				kind: "success" as const,
				data: {
					data: {
						as_of: null,
						found: true,
						stop_id: stopId,
						stop: map[stopId] ?? null,
					},
				},
			};
		});

		const getRoute = vi.fn(async (routeId: string) => {
			if (routeId === "zonal-466") {
				return routePayload({
					route_id: "zonal-466",
					short_name: "466",
					system: "zonal_urbano",
					patterns: [
						{
							shape_id: "z466",
							stops: [
								{
									sequence: 0,
									stop_id: "sitp-76",
									name: zonalStop.name,
									code: null,
									latitude: zonalStop.latitude,
									longitude: zonalStop.longitude,
									offset_seconds: 0,
								},
								{
									sequence: 1,
									stop_id: "sitp-calle100",
									name: tmAlight.name,
									code: null,
									latitude: tmAlight.latitude,
									longitude: tmAlight.longitude,
									offset_seconds: 1080,
								},
							],
							geometry: null,
						},
					],
				});
			}
			if (routeId === "r-b907-n") {
				return routePayload({
					route_id: "r-b907-n",
					short_name: "B907",
					system: "troncal",
					patterns: [
						{
							shape_id: "b907",
							stops: [
								{
									sequence: 0,
									stop_id: "56001",
									name: "Calle 100",
									code: null,
									latitude: tmStation.latitude,
									longitude: tmStation.longitude,
									offset_seconds: 0,
								},
								{
									sequence: 1,
									stop_id: "56496",
									name: "Portal Norte T1",
									code: null,
									latitude: portal.latitude,
									longitude: portal.longitude,
									offset_seconds: 960,
								},
							],
							geometry: null,
						},
					],
				});
			}
			return {
				kind: "success" as const,
				data: {
					data: {
						as_of: null,
						found: false,
						route_id: routeId,
						route: null,
					},
				},
			};
		});

		const getAlerts = vi.fn(async () => ({
			kind: "success" as const,
			data: {
				data: {
					as_of: null,
					route: null,
					stop_id: null,
					count: 0,
					alerts: [],
				},
			},
		}));

		const client = {
			searchStops,
			getRoute,
			getStop,
			getAlerts,
		} as unknown as CromaClient;

		const planner = new RoutePlanner(client);
		const result = await planner.planRoute({
			origin: { latitude: 4.6636, longitude: -74.0603, text: "Calle 76 con Carrera 20" },
			destination: {
				latitude: 4.7338,
				longitude: -74.0613,
				text: "Colina Campestre",
			},
			maxTransfers: 2,
			maxWalkMeters: 1200,
			forceApi: true,
		});

		expect(result.kind).toBe("success");
		if (result.kind !== "success") return;

		const transit = result.plan.segments.filter((s) => s.kind === "transit");
		expect(transit.length).toBeGreaterThanOrEqual(2);
		const systems = new Set(
			transit.map((s) => (s.kind === "transit" ? s.route.system : "")),
		);
		expect(systems.has("zonal_urbano")).toBe(true);
		expect(systems.has("troncal")).toBe(true);
		expect(result.plan.segments.some((s) => s.kind === "transfer")).toBe(true);

		// MCP plan_route is local-graph only (0 credits). Formatter smoke via fixture text:
		expect(
			isSuccessfulMultimodalPlanRouteResult({
				content: [
					{
						type: "text",
						text:
							"Steps:\n1. Take 466 (SITP/zonal_urbano) from A to B (~10 min)\n2. Take B10 (TransMilenio/troncal) from B to C (~15 min)",
					},
				],
			}),
		).toBe(true);
	});
});
