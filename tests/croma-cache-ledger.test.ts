import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ResponseCache, cacheKey } from "../src/lib/croma/cache";
import { CallLedger } from "../src/lib/croma/ledger";
import { CromaClient } from "../src/lib/croma/client";
import { vi } from "vitest";

describe("ResponseCache", () => {
	let dir: string;
	let cache: ResponseCache;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "croma-cache-"));
		cache = new ResponseCache({ dir });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("stores and returns dataset responses", () => {
		const path = "/co/transmilenio/route/v1";
		const body = { route_id: "r1", include_geometry: false };
		const payload = { data: { found: true, route_id: "r1", route: null, as_of: null } };
		cache.set(path, body, payload);
		const hit = cache.get(path, body);
		expect(hit.hit).toBe(true);
		if (hit.hit) expect(hit.response).toEqual(payload);
	});

	it("stable-keys ignore object key order", () => {
		expect(cacheKey("/x", { a: 1, b: 2 })).toBe(cacheKey("/x", { b: 2, a: 1 }));
	});
});

describe("CromaClient credit controls", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "croma-client-"));
		vi.restoreAllMocks();
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("serves a second identical request from cache (0 extra network)", async () => {
		const ledger = new CallLedger({ persist: false });
		const cache = new ResponseCache({ dir });
		const client = new CromaClient({
			apiKey: "test",
			cache,
			ledger,
			maxCalls: 10,
		});

		const mockResponse = {
			data: {
				as_of: null,
				found: true,
				route_id: "100",
				route: {
					route_id: "100",
					short_name: "B10",
					long_name: "Test",
					system: "troncal",
					system_name: "TM",
					mode: "bus",
					color: null,
					text_color: null,
					stops_count: 1,
					trips_per_week: 1,
					first_departure: null,
					last_departure: null,
					patterns: [
						{
							stops: [
								{
									stop_id: "s1",
									code: null,
									name: "A",
									latitude: 4.7,
									longitude: -74.0,
									sequence: 1,
								},
							],
						},
					],
				},
			},
		};

		const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: () => Promise.resolve(mockResponse),
		} as Response);

		const a = await client.getRoute("100", false);
		if (a.kind !== "success") {
			throw new Error(`getRoute failed: ${a.message}`);
		}
		const b = await client.getRoute("100", false);
		expect(b.kind).toBe("success");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(client.getNetworkCallCount()).toBe(1);
		expect(ledger.countHits()).toBe(1);
	});

	it("treats 402 as terminal without retry storm", async () => {
		const ledger = new CallLedger({ persist: false });
		const client = new CromaClient({
			apiKey: "test",
			cache: new ResponseCache({ dir, enabled: false }),
			ledger,
			maxCalls: 10,
			disableCache: true,
		});

		const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
			ok: false,
			status: 402,
			headers: new Headers(),
			text: () =>
				Promise.resolve(
					JSON.stringify({
						code: "billing_error",
						message:
							"no credits left for this period; resets 2026-12-22T20:30:54Z",
					}),
				),
		} as Response);

		const result = await client.searchRoutes({ system: "troncal", page: 1 });
		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.status).toBe(402);
			expect(result.message).toMatch(/2026-12-22/);
			expect(result.message).toMatch(/Stopped without retries/);
		}
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		// Subsequent calls throw BillingError (no more network).
		await expect(
			client.searchRoutes({ system: "dual", page: 1 }),
		).rejects.toThrow(/billing_error|credits reset/i);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("stops before exceeding maxCalls", async () => {
		const client = new CromaClient({
			apiKey: "test",
			cache: new ResponseCache({ dir, enabled: false }),
			ledger: new CallLedger({ persist: false }),
			maxCalls: 1,
			disableCache: true,
		});

		vi.spyOn(global, "fetch").mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: () =>
				Promise.resolve({
					data: {
						as_of: null,
						total: 0,
						total_is_exact: true,
						page: 1,
						per_page: 100,
						total_pages: 1,
						count: 0,
						routes: [],
					},
				}),
		} as Response);

		await client.searchRoutes({ system: "troncal", page: 1 });
		await expect(
			client.searchRoutes({ system: "dual", page: 1 }),
		).rejects.toThrow(/budget exhausted/i);
	});
});
