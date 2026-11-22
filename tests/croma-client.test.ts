import { describe, it, expect, vi, beforeEach } from "vitest";
import { CromaClient } from "../src/lib/croma/client";

describe("CromaClient", () => {
	let client: CromaClient;

	beforeEach(() => {
		client = new CromaClient({
			apiKey: "test-key",
			baseUrl: "https://api.croma.run",
		});
	});

	describe("searchStops", () => {
		it("should parse successful response", async () => {
			const mockResponse = {
				data: {
					as_of: "2024-01-15T10:00:00-05:00",
					query: "Portal Norte",
					total: 1,
					total_is_exact: true,
					page: 1,
					per_page: 20,
					total_pages: 1,
					count: 1,
					stops: [
						{
							stop_id: "10001",
							code: "B096",
							name: "Portal Norte",
							kind: "station",
							parent_station: null,
							latitude: 4.7616,
							longitude: -74.0463,
							wheelchair_boarding: "accessible",
							zone_id: null,
							route_ids: ["10075", "10076"],
							route_codes: ["B10", "B12"],
						},
					],
				},
			};

			vi.spyOn(global, "fetch").mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			} as Response);

			const result = await client.searchStops({ query: "Portal Norte" });

			expect(result.kind).toBe("success");
			if (result.kind === "success") {
				expect(result.data.data.stops).toHaveLength(1);
				expect(result.data.data.stops[0].name).toBe("Portal Norte");
			}
		});

		it("should handle API errors", async () => {
			vi.spyOn(global, "fetch").mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: () => Promise.resolve('{"code":"unauthorized","message":"Invalid API key"}'),
			} as Response);

			const result = await client.searchStops({ query: "Portal Norte" });

			expect(result.kind).toBe("error");
			if (result.kind === "error") {
				expect(result.status).toBe(401);
				expect(result.code).toBe("unauthorized");
			}
		});

		it("should handle parse errors", async () => {
			vi.spyOn(global, "fetch").mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ invalid: "response" }),
			} as Response);

			const result = await client.searchStops({ query: "Portal Norte" });

			expect(result.kind).toBe("error");
			if (result.kind === "error") {
				expect(result.code).toBe("parse_error");
			}
		});
	});

	describe("getStop", () => {
		it("should fetch a single stop", async () => {
			const mockResponse = {
				data: {
					as_of: "2024-01-15T10:00:00-05:00",
					found: true,
					stop_id: "10001",
					stop: {
						stop_id: "10001",
						code: "B096",
						name: "Portal Norte",
						kind: "station",
						parent_station: null,
						latitude: 4.7616,
						longitude: -74.0463,
						wheelchair_boarding: "accessible",
						zone_id: null,
						route_ids: ["10075"],
						route_codes: ["B10"],
					},
				},
			};

			vi.spyOn(global, "fetch").mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			} as Response);

			const result = await client.getStop("10001");

			expect(result.kind).toBe("success");
			if (result.kind === "success") {
				expect(result.data.data.found).toBe(true);
				expect(result.data.data.stop?.name).toBe("Portal Norte");
			}
		});
	});

	describe("getAlerts", () => {
		it("should fetch alerts", async () => {
			const mockResponse = {
				data: {
					as_of: "2024-01-15T10:00:00-05:00",
					route: null,
					stop_id: null,
					count: 1,
					alerts: [
						{
							alert_id: "alert-1",
							cause: "construction",
							effect: "reduced_service",
							header: "Maintenance on B10 corridor",
							description: "Service reduced due to construction",
							url: null,
							active_periods: [{ start: "2024-01-15", end: "2024-01-20" }],
							routes: [{ route_id: "10075", route_code: "B10", route_name: "Portal Sur" }],
							stops: [],
						},
					],
				},
			};

			vi.spyOn(global, "fetch").mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			} as Response);

			const result = await client.getAlerts({});

			expect(result.kind).toBe("success");
			if (result.kind === "success") {
				expect(result.data.data.alerts).toHaveLength(1);
				expect(result.data.data.alerts[0].effect).toBe("reduced_service");
			}
		});
	});
});
