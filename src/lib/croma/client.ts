import { z } from "zod";
import { ResponseCache } from "./cache";
import {
	CallLedger,
	getSharedLedger,
	type LedgerEntry,
} from "./ledger";
import { DEFAULT_SYNC_MAX_CALLS } from "./paths";
import {
	type CromaResult,
	type StopsSearchParams,
	type RoutesSearchParams,
	type StopArrivalsParams,
	type StopDeparturesParams,
	type VehiclesParams,
	type AlertsParams,
	StopsSearchResponse,
	StopResponse,
	RoutesSearchResponse,
	RouteResponse,
	StopArrivalsResponse,
	StopDeparturesResponse,
	VehiclesResponse,
	AlertsResponse,
} from "./types";

const CROMA_BASE_URL = "https://api.croma.run";

export type CromaClientConfig = {
	apiKey: string;
	baseUrl?: string;
	/** Hard cap on network calls (cache hits do not count). */
	maxCalls?: number;
	/** Disable disk/memory response cache. */
	disableCache?: boolean;
	/** Custom cache instance (tests). */
	cache?: ResponseCache;
	/** Custom ledger (tests). */
	ledger?: CallLedger;
	/** Persist ledger to disk (default true). */
	persistLedger?: boolean;
};

export type BudgetStatus = {
	maxCalls: number | null;
	used: number;
	remaining: number | null;
};

function headerMap(response: Response): Record<string, string> {
	const out: Record<string, string> = {};
	const headers = response.headers;
	if (headers && typeof headers.forEach === "function") {
		headers.forEach((value, key) => {
			out[key.toLowerCase()] = value;
		});
	}
	return out;
}

function parseCredits(headers: Record<string, string>): number | null {
	const keys = [
		"x-credits-remaining",
		"x-credit-remaining",
		"x-croma-credits-remaining",
		"credits-remaining",
	];
	for (const key of keys) {
		const raw = headers[key];
		if (raw == null) continue;
		const n = Number(raw);
		if (Number.isFinite(n)) return n;
	}
	return null;
}

function parseRateRemaining(headers: Record<string, string>): number | null {
	const raw =
		headers["x-ratelimit-remaining"] ?? headers["ratelimit-remaining"];
	if (raw == null) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

function extractBillingReset(message: string, body: unknown): string | null {
	const fromMsg = message.match(
		/resets?\s+(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/i,
	);
	if (fromMsg) return fromMsg[1];
	if (body && typeof body === "object") {
		const obj = body as Record<string, unknown>;
		for (const key of ["reset_at", "resets_at", "period_end", "reset"]) {
			const v = obj[key];
			if (typeof v === "string") return v;
		}
	}
	return null;
}

export class BudgetExceededError extends Error {
	readonly used: number;
	readonly maxCalls: number;

	constructor(used: number, maxCalls: number) {
		super(
			`Croma call budget exhausted (${used}/${maxCalls} network calls). Progress was saved — resume later or raise --max-calls.`,
		);
		this.name = "BudgetExceededError";
		this.used = used;
		this.maxCalls = maxCalls;
	}
}

export class BillingError extends Error {
	readonly status = 402;
	readonly code: string;
	readonly resetAt: string | null;

	constructor(message: string, code: string, resetAt: string | null) {
		super(
			resetAt
				? `Croma billing_error (${code}): ${message}. Credits reset at ${resetAt}. Stopped without retries.`
				: `Croma billing_error (${code}): ${message}. Stopped without retries.`,
		);
		this.name = "BillingError";
		this.code = code;
		this.resetAt = resetAt;
	}
}

export class CromaClient {
	private apiKey: string;
	private baseUrl: string;
	private maxCalls: number | null;
	private networkCalls = 0;
	private cache: ResponseCache;
	private ledger: CallLedger;
	private inflight = new Map<string, Promise<CromaResult<unknown>>>();
	private terminalBilling: BillingError | null = null;

	constructor(config: CromaClientConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl ?? CROMA_BASE_URL;
		this.maxCalls =
			config.maxCalls === undefined
				? null
				: config.maxCalls ?? DEFAULT_SYNC_MAX_CALLS;
		this.cache =
			config.cache ??
			new ResponseCache({ enabled: config.disableCache !== true });
		this.ledger =
			config.ledger ??
			getSharedLedger();
	}

	getBudget(): BudgetStatus {
		return {
			maxCalls: this.maxCalls,
			used: this.networkCalls,
			remaining:
				this.maxCalls == null
					? null
					: Math.max(0, this.maxCalls - this.networkCalls),
		};
	}

	setMaxCalls(maxCalls: number | null | undefined): void {
		this.maxCalls = maxCalls ?? null;
	}

	getLedger(): CallLedger {
		return this.ledger;
	}

	getCache(): ResponseCache {
		return this.cache;
	}

	getNetworkCallCount(): number {
		return this.networkCalls;
	}

	private assertBudget(): void {
		if (this.terminalBilling) {
			throw this.terminalBilling;
		}
		if (this.maxCalls != null && this.networkCalls >= this.maxCalls) {
			throw new BudgetExceededError(this.networkCalls, this.maxCalls);
		}
	}

	private async request<T>(
		path: string,
		body: Record<string, unknown>,
		schema: z.ZodType<T>,
	): Promise<CromaResult<T>> {
		const started = Date.now();
		const cacheLookup = this.cache.get(path, body);
		if (cacheLookup.hit) {
			const parsed = schema.safeParse(cacheLookup.response);
			const entry: LedgerEntry = {
				ts: new Date().toISOString(),
				endpoint: path,
				params: body,
				cache: "hit",
				status: 200,
				credits: cacheLookup.headers
					? parseCredits(cacheLookup.headers)
					: null,
				duration_ms: Date.now() - started,
			};
			this.ledger.record(entry);
			if (!parsed.success) {
				return {
					kind: "error",
					status: 200,
					code: "parse_error",
					message: `Cached response parse error: ${parsed.error.message}`,
				};
			}
			return { kind: "success", data: parsed.data };
		}

		const coalesceKey = cacheLookup.key;
		const existing = this.inflight.get(coalesceKey);
		if (existing) {
			this.ledger.record({
				ts: new Date().toISOString(),
				endpoint: path,
				params: body,
				cache: "coalesced",
				duration_ms: Date.now() - started,
			});
			return existing as Promise<CromaResult<T>>;
		}

		const run = this.networkRequest(path, body, schema, started);
		this.inflight.set(coalesceKey, run as Promise<CromaResult<unknown>>);
		try {
			return await run;
		} finally {
			this.inflight.delete(coalesceKey);
		}
	}

	private async networkRequest<T>(
		path: string,
		body: Record<string, unknown>,
		schema: z.ZodType<T>,
		started: number,
	): Promise<CromaResult<T>> {
		this.assertBudget();

		const url = `${this.baseUrl}${path}`;
		let lastError: CromaResult<T> | null = null;

		for (let attempt = 0; attempt < 4; attempt++) {
			this.assertBudget();
			this.networkCalls += 1;

			let response: Response;
			try {
				response = await fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.apiKey}`,
					},
					body: JSON.stringify(body),
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				this.ledger.record({
					ts: new Date().toISOString(),
					endpoint: path,
					params: body,
					cache: "miss",
					error: message,
					duration_ms: Date.now() - started,
				});
				lastError = {
					kind: "error",
					status: 0,
					code: "network_error",
					message,
				};
				await sleep(200 * Math.pow(2, attempt));
				continue;
			}

			const headers = headerMap(response);
			const credits = parseCredits(headers);
			const rateRemaining = parseRateRemaining(headers);

			if (response.status === 402) {
				const errorBody = await response.text();
				let parsed: { code?: string; message?: string };
				try {
					parsed = JSON.parse(errorBody);
				} catch {
					parsed = { message: errorBody };
				}
				const message = parsed.message ?? "plan_limit_reached";
				const code = parsed.code ?? "billing_error";
				const resetAt = extractBillingReset(message, parsed);
				const billing = new BillingError(message, code, resetAt);
				this.terminalBilling = billing;
				this.ledger.record({
					ts: new Date().toISOString(),
					endpoint: path,
					params: body,
					cache: "miss",
					status: 402,
					code,
					credits,
					rate_limit_remaining: rateRemaining,
					error: billing.message,
					duration_ms: Date.now() - started,
				});
				return {
					kind: "error",
					status: 402,
					code,
					message: billing.message,
				};
			}

			if (response.status === 429) {
				this.ledger.record({
					ts: new Date().toISOString(),
					endpoint: path,
					params: body,
					cache: "miss",
					status: 429,
					code: "rate_limited",
					credits,
					rate_limit_remaining: rateRemaining,
					duration_ms: Date.now() - started,
				});
				if (attempt < 3) {
					await sleep(500 * Math.pow(2, attempt + 1));
					continue;
				}
				return {
					kind: "error",
					status: 429,
					code: "rate_limited",
					message: "HTTP 429 rate limited after retries",
				};
			}

			if (!response.ok) {
				const errorBody = await response.text();
				let parsed: { code?: string; message?: string };
				try {
					parsed = JSON.parse(errorBody);
				} catch {
					parsed = { message: errorBody };
				}
				const result: CromaResult<T> = {
					kind: "error",
					status: response.status,
					code: parsed.code ?? "unknown",
					message: parsed.message ?? `HTTP ${response.status}`,
				};
				this.ledger.record({
					ts: new Date().toISOString(),
					endpoint: path,
					params: body,
					cache: "miss",
					status: response.status,
					code: result.code,
					credits,
					rate_limit_remaining: rateRemaining,
					error: result.message,
					duration_ms: Date.now() - started,
				});
				return result;
			}

			const json = await response.json();
			const result = schema.safeParse(json);
			if (!result.success) {
				this.ledger.record({
					ts: new Date().toISOString(),
					endpoint: path,
					params: body,
					cache: "miss",
					status: 200,
					code: "parse_error",
					credits,
					rate_limit_remaining: rateRemaining,
					error: result.error.message,
					duration_ms: Date.now() - started,
				});
				return {
					kind: "error",
					status: 200,
					code: "parse_error",
					message: `Response parse error: ${result.error.message}`,
				};
			}

			this.cache.set(path, body, json, headers);
			this.ledger.record({
				ts: new Date().toISOString(),
				endpoint: path,
				params: body,
				cache: "miss",
				status: 200,
				credits,
				rate_limit_remaining: rateRemaining,
				duration_ms: Date.now() - started,
			});
			return { kind: "success", data: result.data };
		}

		return (
			lastError ?? {
				kind: "error",
				status: 0,
				code: "unknown",
				message: "Request failed",
			}
		);
	}

	async searchStops(
		params: StopsSearchParams,
	): Promise<CromaResult<z.infer<typeof StopsSearchResponse>>> {
		return this.request(
			"/co/transmilenio/stops-search/v1",
			params as Record<string, unknown>,
			StopsSearchResponse,
		);
	}

	async getStop(
		stopId: string,
	): Promise<CromaResult<z.infer<typeof StopResponse>>> {
		return this.request(
			"/co/transmilenio/stop/v1",
			{ stop_id: stopId },
			StopResponse,
		);
	}

	async searchRoutes(
		params: RoutesSearchParams,
	): Promise<CromaResult<z.infer<typeof RoutesSearchResponse>>> {
		return this.request(
			"/co/transmilenio/routes-search/v1",
			params as Record<string, unknown>,
			RoutesSearchResponse,
		);
	}

	async getRoute(
		routeId: string,
		includeGeometry = false,
	): Promise<CromaResult<z.infer<typeof RouteResponse>>> {
		return this.request(
			"/co/transmilenio/route/v1",
			{ route_id: routeId, include_geometry: includeGeometry },
			RouteResponse,
		);
	}

	async getStopArrivals(
		params: StopArrivalsParams,
	): Promise<CromaResult<z.infer<typeof StopArrivalsResponse>>> {
		return this.request(
			"/co/transmilenio/stop-arrivals/v1",
			params as Record<string, unknown>,
			StopArrivalsResponse,
		);
	}

	async getStopDepartures(
		params: StopDeparturesParams,
	): Promise<CromaResult<z.infer<typeof StopDeparturesResponse>>> {
		return this.request(
			"/co/transmilenio/stop-departures/v1",
			params as Record<string, unknown>,
			StopDeparturesResponse,
		);
	}

	async getVehicles(
		params: VehiclesParams,
	): Promise<CromaResult<z.infer<typeof VehiclesResponse>>> {
		return this.request(
			"/co/transmilenio/vehicles/v1",
			params as Record<string, unknown>,
			VehiclesResponse,
		);
	}

	async getAlerts(
		params: AlertsParams,
	): Promise<CromaResult<z.infer<typeof AlertsResponse>>> {
		return this.request(
			"/co/transmilenio/alerts/v1",
			params as Record<string, unknown>,
			AlertsResponse,
		);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let defaultClient: CromaClient | null = null;

export function getCromaClient(options?: {
	maxCalls?: number;
}): CromaClient {
	if (!defaultClient) {
		const apiKey = process.env.CROMA_API_KEY;
		if (!apiKey) {
			throw new Error(
				"CROMA_API_KEY environment variable is required. Get a key at https://usecroma.com",
			);
		}
		const envMax = process.env.CROMA_MAX_CALLS
			? parseInt(process.env.CROMA_MAX_CALLS, 10)
			: undefined;
		defaultClient = new CromaClient({
			apiKey,
			maxCalls: options?.maxCalls ?? envMax,
		});
	} else if (options?.maxCalls != null) {
		defaultClient.setMaxCalls(options.maxCalls);
	}
	return defaultClient;
}

export function createCromaClient(config: CromaClientConfig): CromaClient {
	return new CromaClient(config);
}

/** Test helper — reset the singleton. */
export function resetDefaultCromaClient(): void {
	defaultClient = null;
}
