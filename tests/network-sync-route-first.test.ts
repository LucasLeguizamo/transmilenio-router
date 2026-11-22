import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CallLedger } from "../src/lib/croma/ledger";
import { ResponseCache } from "../src/lib/croma/cache";
import { CromaClient } from "../src/lib/croma/client";
import { stopsFromRoutes, syncNetwork } from "../src/lib/network/sync";
import { estimateSyncCalls } from "../src/lib/network/estimate";
import * as networkStore from "../src/lib/network/store";
import type { NetworkRoute } from "../src/lib/network/types";

describe("stopsFromRoutes", () => {
	it("dedupes stops across patterns and collects route ids", () => {
		const routes: NetworkRoute[] = [
			{
				id: "r1",
				code: "B10",
				name: "North",
				system: "troncal",
				color: null,
				patterns: [
					{
						shape_id: null,
						stops: [
							{
								id: "s1",
								seq: 1,
								offset: 0,
								name: "Portal",
								lat: 4.76,
								lon: -74.04,
							},
							{
								id: "s2",
								seq: 2,
								offset: 60,
								name: "Calle 100",
								lat: 4.68,
								lon: -74.05,
							},
						],
					},
				],
			},
			{
				id: "r2",
				code: "466",
				name: "Zonal",
				system: "zonal_urbano",
				color: null,
				patterns: [
					{
						shape_id: null,
						stops: [
							{
								id: "s2",
								seq: 1,
								offset: 0,
								name: "Calle 100",
								lat: 4.68,
								lon: -74.05,
							},
						],
					},
				],
			},
		];
		const stops = stopsFromRoutes(routes);
		expect(stops).toHaveLength(2);
		const s2 = stops.find((s) => s.id === "s2");
		expect(s2?.route_ids.sort()).toEqual(["r1", "r2"]);
		expect(s2?.systems.sort()).toEqual(["troncal", "zonal_urbano"]);
	});
});

describe("estimateSyncCalls", () => {
	it("projects cold sync around list pages + route details", () => {
		const estimate = estimateSyncCalls({
			expectedRoutes: 1045,
			expectedListPages: 14,
		});
		expect(estimate.total_cold).toBe(1059);
		expect(estimate.strategy).toBe("route_first");
		expect(estimate.notes.length).toBeGreaterThan(0);
	});
});

describe("syncNetwork route-first with recorded responses", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "sync-rf-"));
		vi.restoreAllMocks();
		vi.spyOn(networkStore, "loadSyncState").mockReturnValue(null);
		vi.spyOn(networkStore, "loadSnapshot").mockReturnValue(null);
		vi.spyOn(networkStore, "saveSyncState").mockImplementation(() => {});
		vi.spyOn(networkStore, "saveSnapshot").mockImplementation(() => {});
		vi.spyOn(networkStore, "saveGraph").mockImplementation(() => {});
		vi.spyOn(networkStore, "clearSyncState").mockImplementation(() => {});
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("builds snapshot from routes-search + route/v1 without stops-search", async () => {
		const ledger = new CallLedger({ persist: false });
		const cache = new ResponseCache({
			dir: join(dir, "cache"),
		});
		const client = new CromaClient({
			apiKey: "test",
			cache,
			ledger,
			maxCalls: 50,
		});

		vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as Record<
				string,
				unknown
			>;
			const url = String(_url);

			if (url.includes("routes-search")) {
				const system = body.system;
				const routes =
					system === "troncal"
						? [
								{
									route_id: "r-tm",
									short_name: "B10",
									long_name: "TM",
									system: "troncal",
									system_name: "TM",
									mode: "bus",
									color: null,
									text_color: null,
									stops_count: 2,
									trips_per_week: 10,
									first_departure: null,
									last_departure: null,
								},
							]
						: [];
				return {
					ok: true,
					status: 200,
					headers: new Headers(),
					json: async () => ({
						data: {
							as_of: null,
							system,
							total: routes.length,
							total_is_exact: true,
							page: 1,
							per_page: 100,
							total_pages: 1,
							count: routes.length,
							routes,
						},
					}),
				} as Response;
			}

			if (url.includes("/route/v1")) {
				return {
					ok: true,
					status: 200,
					headers: new Headers(),
					json: async () => ({
						data: {
							as_of: null,
							found: true,
							route_id: body.route_id,
							route: {
								route_id: body.route_id,
								short_name: "B10",
								long_name: "TM",
								system: "troncal",
								system_name: "TM",
								mode: "bus",
								color: null,
								text_color: null,
								stops_count: 2,
								trips_per_week: 10,
								first_departure: null,
								last_departure: null,
								patterns: [
									{
										stops: [
											{
												stop_id: "55007",
												code: null,
												name: "Calle 100",
												latitude: 4.686,
												longitude: -74.055,
												sequence: 1,
												offset_seconds: 0,
											},
											{
												stop_id: "55770",
												code: null,
												name: "Portal del Norte",
												latitude: 4.761,
												longitude: -74.046,
												sequence: 2,
												offset_seconds: 900,
											},
										],
									},
								],
							},
						},
					}),
				} as Response;
			}

			throw new Error(`Unexpected URL ${url}`);
		});

		const result = await syncNetwork({
			client,
			resume: false,
			rateMs: 0,
			maxCalls: 50,
		});

		if (!result.success) {
			throw new Error(
				`sync failed: ${JSON.stringify({ errors: result.errors, warnings: result.warnings, stopped: result.stopped_reason, calls: result.api_calls })}`,
			);
		}
		expect(result.success).toBe(true);
		expect(result.counts?.routes).toBe(1);
		expect(result.counts?.stops).toBe(2);
		expect(result.stops_from_patterns).toBe(true);
		// 7 systems list + 1 route detail (other systems empty still 1 page each)
		expect(result.api_calls).toBe(8);
		expect(
			ledger
				.getEntries()
				.some((e) => e.endpoint.includes("stops-search")),
		).toBe(false);

		// Second sync should be mostly cache hits.
		const client2 = new CromaClient({
			apiKey: "test",
			cache,
			ledger: new CallLedger({ persist: false }),
			maxCalls: 50,
		});
		const refresh = await syncNetwork({
			client: client2,
			resume: false,
			rateMs: 0,
			maxCalls: 50,
		});
		expect(refresh.success).toBe(true);
		expect(client2.getNetworkCallCount()).toBe(0);
	});
});
