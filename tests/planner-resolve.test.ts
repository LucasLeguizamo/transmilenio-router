import { describe, it, expect, vi } from "vitest";
import { RoutePlanner } from "../src/lib/routing/planner";
import type { CromaClient } from "../src/lib/croma/client";
import type { Stop } from "../src/lib/croma/types";

function station(
	partial: Partial<Stop> & Pick<Stop, "stop_id" | "name">,
): Stop {
	return {
		code: null,
		kind: "station",
		parent_station: null,
		latitude: 4.68,
		longitude: -74.055,
		wheelchair_boarding: null,
		zone_id: null,
		route_ids: ["10075"],
		route_codes: ["B10"],
		...partial,
	};
}

function streetStop(
	partial: Partial<Stop> & Pick<Stop, "stop_id" | "name">,
): Stop {
	return {
		code: null,
		kind: "stop",
		parent_station: null,
		latitude: 4.5,
		longitude: -74.2,
		wheelchair_boarding: null,
		zone_id: null,
		route_ids: ["999"],
		route_codes: ["Z1"],
		...partial,
	};
}

describe("RoutePlanner name resolution", () => {
	it("uses matched stations from stops-search, not a proximity re-search", async () => {
		const portal = station({
			stop_id: "55770",
			name: "Portal del Norte",
			latitude: 4.7616,
			longitude: -74.0463,
			route_ids: ["10075"],
			route_codes: ["B10"],
		});
		const calle100 = station({
			stop_id: "55000",
			name: "Calle 100",
			latitude: 4.68,
			longitude: -74.055,
			route_ids: ["10075"],
			route_codes: ["B10"],
		});
		const wrongStreet = streetStop({
			stop_id: "street-100",
			name: "Calle 100 A 15-20",
			latitude: 4.2,
			longitude: -74.5,
			route_ids: ["other"],
			route_codes: ["Z9"],
		});

		const searchStops = vi.fn(async (params: { query?: string; kind?: string }) => {
			if (params.query === "Portal Norte" && params.kind === "station") {
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
							stops: [portal],
						},
					},
				};
			}
			if (params.query === "Calle 100" && params.kind === "station") {
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
							stops: [calle100],
						},
					},
				};
			}
			if (params.query === "Calle 100" && !params.kind) {
				return {
					kind: "success" as const,
					data: {
						data: {
							as_of: null,
							total: 2,
							total_is_exact: true,
							page: 1,
							per_page: 20,
							total_pages: 1,
							count: 2,
							stops: [wrongStreet, calle100],
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

		const getRoute = vi.fn(async () => ({
			kind: "success" as const,
			data: {
				data: {
					as_of: null,
					found: true,
					route_id: "10075",
					route: {
						route_id: "10075",
						short_name: "B10",
						long_name: "Portal Sur",
						system: "troncal" as const,
						system_name: "Transmilenio-Troncal",
						mode: "bus" as const,
						color: "#E31937",
						text_color: "#FFFFFF",
						stops_count: 2,
						trips_per_week: 100,
						first_departure: "05:00:00",
						last_departure: "23:00:00",
						patterns: [
							{
								pattern_id: "p1",
								headsign: "Sur",
								direction: 0,
								stops: [
									{
										stop_id: portal.stop_id,
										code: null,
										name: portal.name,
										latitude: portal.latitude,
										longitude: portal.longitude,
										minutes: 0,
									},
									{
										stop_id: calle100.stop_id,
										code: null,
										name: calle100.name,
										latitude: calle100.latitude,
										longitude: calle100.longitude,
										minutes: 20,
									},
								],
								geometry: null,
							},
						],
					},
				},
			},
		}));

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
			getAlerts,
		} as unknown as CromaClient;

		const planner = new RoutePlanner(client);
		const result = await planner.planRoute({
			origin: { text: "Portal Norte" },
			destination: { text: "Calle 100" },
		});

		expect(result.kind).toBe("success");
		if (result.kind === "success") {
			expect(result.plan.destination.name).toBe("Calle 100");
			expect(
				result.plan.segments.some((segment) => segment.kind === "transit"),
			).toBe(true);
		}

		// Must not fall back to a proximity search that would miss the station.
		expect(
			searchStops.mock.calls.some(
				(call) =>
					typeof call[0] === "object" &&
					call[0] !== null &&
					"latitude" in call[0],
			),
		).toBe(false);
	});
});
