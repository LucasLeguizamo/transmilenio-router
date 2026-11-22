import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCPTools } from "../src/lib/mcp/tools";
import { CromaClient } from "../src/lib/croma/client";
import { CallLedger } from "../src/lib/croma/ledger";
import { ResponseCache } from "../src/lib/croma/cache";
import * as networkStore from "../src/lib/network/store";

describe("MCPTools", () => {
	let tools: MCPTools;
	let mockClient: CromaClient;

	beforeEach(() => {
		vi.restoreAllMocks();
		// Exercise Croma fallback path (no local snapshot).
		vi.spyOn(networkStore, "loadNetworkBundle").mockReturnValue(null);
		mockClient = new CromaClient({
			apiKey: "test-key",
			baseUrl: "https://api.croma.run",
			disableCache: true,
			cache: new ResponseCache({ enabled: false }),
			ledger: new CallLedger({ persist: false }),
		});
		tools = new MCPTools(mockClient);
	});

	describe("findStops", () => {
		it("should return formatted stops with UI reference", async () => {
			vi.spyOn(mockClient, "searchStops").mockResolvedValueOnce({
				kind: "success",
				data: {
					data: {
						as_of: "2024-01-15T10:00:00-05:00",
						total: 1,
						total_is_exact: true,
						page: 1,
						per_page: 10,
						total_pages: 1,
						count: 1,
						stops: [
							{
								stop_id: "10001",
								code: "B096",
								name: "Portal Norte",
								kind: "station" as const,
								parent_station: null,
								latitude: 4.7616,
								longitude: -74.0463,
								wheelchair_boarding: "accessible" as const,
								zone_id: null,
								route_ids: ["10075"],
								route_codes: ["B10"],
							},
						],
					},
				},
			});

			const result = await tools.findStops({ query: "Portal Norte" });

			expect(result.content).toHaveLength(1);
			expect(result.content[0].text).toContain("Portal Norte");
			expect(result._meta?.ui).toContain("ui://transmilenio-mcp/stops-map");
		});

		it("should handle empty results", async () => {
			vi.spyOn(mockClient, "searchStops").mockResolvedValueOnce({
				kind: "success",
				data: {
					data: {
						as_of: "2024-01-15T10:00:00-05:00",
						total: 0,
						total_is_exact: true,
						page: 1,
						per_page: 10,
						total_pages: 0,
						count: 0,
						stops: [],
					},
				},
			});

			const result = await tools.findStops({ query: "NonexistentStop" });

			expect(result.content[0].text).toContain("No stops found");
		});

		it("should handle API errors", async () => {
			vi.spyOn(mockClient, "searchStops").mockResolvedValueOnce({
				kind: "error",
				status: 500,
				code: "internal_error",
				message: "Internal server error",
			});

			const result = await tools.findStops({ query: "Portal Norte" });

			expect(result.content[0].text).toContain("Error");
		});
	});

	describe("getServiceAlerts", () => {
		it("should return formatted alerts with UI reference", async () => {
			vi.spyOn(mockClient, "getAlerts").mockResolvedValueOnce({
				kind: "success",
				data: {
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
								description: null,
								url: null,
								active_periods: [],
								routes: [{ route_id: "10075", route_code: "B10", route_name: null }],
								stops: [],
							},
						],
					},
				},
			});

			const result = await tools.getServiceAlerts({});

			expect(result.content[0].text).toContain("Service Alert");
			expect(result.content[0].text).toContain("REDUCED_SERVICE");
			expect(result._meta?.ui).toContain("ui://transmilenio-mcp/alerts");
		});

		it("decodes HTML entities and caps alert output", async () => {
			const many = Array.from({ length: 25 }, (_, i) => ({
				alert_id: `alert-${i}`,
				cause: "construction",
				effect: "detour",
				header: `CICLOV&Iacute;A ${i}`,
				description: null,
				url: null,
				active_periods: [],
				routes: [{ route_id: "10075", route_code: null, route_name: null }],
				stops: [],
			}));

			vi.spyOn(mockClient, "getAlerts").mockResolvedValueOnce({
				kind: "success",
				data: {
					data: {
						as_of: "2024-01-15T10:00:00-05:00",
						route: null,
						stop_id: null,
						count: many.length,
						alerts: many,
					},
				},
			});

			const result = await tools.getServiceAlerts({ limit: 5 });

			expect(result.content[0].text).toContain("Showing 5 of 25");
			expect(result.content[0].text).toContain("CICLOVÍA");
			expect(result.content[0].text).not.toContain("&Iacute;");
		});

		it("should handle no active alerts", async () => {
			vi.spyOn(mockClient, "getAlerts").mockResolvedValueOnce({
				kind: "success",
				data: {
					data: {
						as_of: "2024-01-15T10:00:00-05:00",
						route: null,
						stop_id: null,
						count: 0,
						alerts: [],
					},
				},
			});

			const result = await tools.getServiceAlerts({});

			expect(result.content[0].text).toContain("No active service alerts");
		});
	});
});
