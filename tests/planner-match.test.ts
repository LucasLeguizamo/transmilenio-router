import { describe, it, expect, vi } from "vitest";
import { RoutePlanner } from "../src/lib/routing/planner";
import type { CromaClient } from "../src/lib/croma/client";
import {
	StopsSearchResponse,
	RouteResponse,
} from "../src/lib/croma/types";
import portalFixture from "./__fixtures__/croma-stops-portal-norte-live.json";
import calle100Fixture from "./__fixtures__/croma-stops-calle-100-live.json";
import routeB907Fixture from "./__fixtures__/croma-route-b907-live.json";

describe("live-shaped Croma fixtures", () => {
	it("parses Portal Norte / Calle 100 stops-search and B907 route/v1 shapes", () => {
		expect(StopsSearchResponse.safeParse(portalFixture).success).toBe(true);
		expect(StopsSearchResponse.safeParse(calle100Fixture).success).toBe(true);
		expect(RouteResponse.safeParse(routeB907Fixture).success).toBe(true);
	});
});

describe("RoutePlanner direct match across station vs platform ids", () => {
	it("plans Portal Norte → Calle 100 via shared route_code when route_ids differ and patterns use platforms", async () => {
		const portal = StopsSearchResponse.parse(portalFixture).data.stops[0];
		const calle100 = StopsSearchResponse.parse(calle100Fixture).data.stops[0];
		const routePayload = RouteResponse.parse(routeB907Fixture);

		const searchStops = vi.fn(async (params: { query?: string; kind?: string }) => {
			if (params.query?.includes("Portal") && params.kind === "station") {
				return {
					kind: "success" as const,
					data: {
						data: {
							...portalFixture.data,
							stops: [portal],
						},
					},
				};
			}
			if (params.query?.includes("Calle 100") && params.kind === "station") {
				return {
					kind: "success" as const,
					data: {
						data: {
							...calle100Fixture.data,
							stops: [calle100],
						},
					},
				};
			}
			return {
				kind: "success" as const,
				data: {
					data: {
						as_of: null,
						total: 0,
						total_is_exact: true,
						page: 1,
						per_page: 20,
						total_pages: 0,
						count: 0,
						stops: [],
					},
				},
			};
		});

		const getRoute = vi.fn(async (routeId: string) => {
			if (routeId === "r-b907-s") {
				return { kind: "success" as const, data: routePayload };
			}
			// Other direction / codes: empty patterns so only B907-s matches.
			return {
				kind: "success" as const,
				data: {
					data: {
						as_of: null,
						found: true,
						route_id: routeId,
						route: {
							...routePayload.data.route!,
							route_id: routeId,
							patterns: [
								{
									shape_id: `shape-${routeId}`,
									trips_per_week: 1,
									length_m: 1000,
									stops: [
										{
											sequence: 0,
											stop_id: "other-a",
											name: "Elsewhere",
											code: null,
											latitude: 4.5,
											longitude: -74.1,
											offset_seconds: 0,
										},
									],
									geometry: null,
								},
							],
						},
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

		const getStop = vi.fn(async (stopId: string) => ({
			kind: "success" as const,
			data: {
				data: {
					as_of: null,
					found: true,
					stop_id: stopId,
					stop: stopId === portal.stop_id ? portal : calle100,
				},
			},
		}));

		const client = {
			searchStops,
			getRoute,
			getAlerts,
			getStop,
		} as unknown as CromaClient;

		const planner = new RoutePlanner(client);
		const result = await planner.planRoute({
			origin: { text: "Portal Norte" },
			destination: { text: "Calle 100" },
			maxTransfers: 1,
			debug: true,
		});

		expect(result.kind).toBe("success");
		if (result.kind !== "success") return;

		const transit = result.plan.segments.find((s) => s.kind === "transit");
		expect(transit).toBeDefined();
		if (transit?.kind === "transit") {
			expect(transit.route.short_name).toBe("B907");
			// Pattern platforms, not parent station ids.
			expect(transit.boardStop.stop_id).toBe("56496");
			expect(transit.alightStop.stop_id).toBe("56001");
		}

		expect(result.debug?.sharedRouteCodes).toContain("B907");
		expect(
			result.debug?.candidatesTried.some((c) =>
				c.outcome.startsWith("matched"),
			),
		).toBe(true);

		// Station ids alone would not appear in the pattern; platforms must be used.
		expect(portal.platforms).toContain("56496");
		expect(calle100.platforms).toContain("56001");
		expect(portal.route_ids).not.toContain("r-b907-n");
		expect(calle100.route_ids).not.toContain("r-b907-s");
	});

	it("still matches when search omits platforms and stop/v1 hydrates them", async () => {
		const portalFull = StopsSearchResponse.parse(portalFixture).data.stops[0];
		const calle100Full = StopsSearchResponse.parse(calle100Fixture).data.stops[0];
		const portalThin = { ...portalFull, platforms: [] as string[] };
		const calle100Thin = { ...calle100Full, platforms: [] as string[] };
		const routePayload = RouteResponse.parse(routeB907Fixture);

		const searchStops = vi.fn(async (params: { query?: string; kind?: string }) => {
			const stop = params.query?.includes("Portal") ? portalThin : calle100Thin;
			return {
				kind: "success" as const,
				data: {
					data: {
						as_of: null,
						total: 1,
						total_is_exact: true,
						page: 1,
						per_page: 20,
						total_pages: 1,
						count: 1,
						stops: [stop],
					},
				},
			};
		});

		const getStop = vi.fn(async (stopId: string) => ({
			kind: "success" as const,
			data: {
				data: {
					as_of: null,
					found: true,
					stop_id: stopId,
					stop: stopId === "55770" ? portalFull : calle100Full,
				},
			},
		}));

		const getRoute = vi.fn(async (routeId: string) => {
			if (routeId !== "r-b907-s") {
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
			}
			return { kind: "success" as const, data: routePayload };
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

		const planner = new RoutePlanner({
			searchStops,
			getRoute,
			getAlerts,
			getStop,
		} as unknown as CromaClient);

		const result = await planner.planRoute({
			origin: { text: "Portal Norte" },
			destination: { text: "Calle 100" },
			maxTransfers: 1,
		});

		expect(result.kind).toBe("success");
		expect(getStop).toHaveBeenCalled();
	});
});
