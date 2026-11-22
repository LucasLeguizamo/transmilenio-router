import { z } from "zod";
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

type CromaClientConfig = {
	apiKey: string;
	baseUrl?: string;
};

export class CromaClient {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: CromaClientConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl ?? CROMA_BASE_URL;
	}

	private async request<T>(
		path: string,
		body: Record<string, unknown>,
		schema: z.ZodType<T>,
	): Promise<CromaResult<T>> {
		const url = `${this.baseUrl}${path}`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorBody = await response.text();
			let parsed: { code?: string; message?: string };
			try {
				parsed = JSON.parse(errorBody);
			} catch {
				parsed = { message: errorBody };
			}
			return {
				kind: "error",
				status: response.status,
				code: parsed.code ?? "unknown",
				message: parsed.message ?? `HTTP ${response.status}`,
			};
		}

		const json = await response.json();
		const result = schema.safeParse(json);

		if (!result.success) {
			return {
				kind: "error",
				status: 200,
				code: "parse_error",
				message: `Response parse error: ${result.error.message}`,
			};
		}

		return { kind: "success", data: result.data };
	}

	async searchStops(
		params: StopsSearchParams,
	): Promise<CromaResult<z.infer<typeof StopsSearchResponse>>> {
		return this.request(
			"/co/transmilenio/stops-search/v1",
			params,
			StopsSearchResponse,
		);
	}

	async getStop(
		stopId: string,
	): Promise<CromaResult<z.infer<typeof StopResponse>>> {
		return this.request("/co/transmilenio/stop/v1", { stop_id: stopId }, StopResponse);
	}

	async searchRoutes(
		params: RoutesSearchParams,
	): Promise<CromaResult<z.infer<typeof RoutesSearchResponse>>> {
		return this.request(
			"/co/transmilenio/routes-search/v1",
			params,
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
			params,
			StopArrivalsResponse,
		);
	}

	async getStopDepartures(
		params: StopDeparturesParams,
	): Promise<CromaResult<z.infer<typeof StopDeparturesResponse>>> {
		return this.request(
			"/co/transmilenio/stop-departures/v1",
			params,
			StopDeparturesResponse,
		);
	}

	async getVehicles(
		params: VehiclesParams,
	): Promise<CromaResult<z.infer<typeof VehiclesResponse>>> {
		return this.request("/co/transmilenio/vehicles/v1", params, VehiclesResponse);
	}

	async getAlerts(
		params: AlertsParams,
	): Promise<CromaResult<z.infer<typeof AlertsResponse>>> {
		return this.request("/co/transmilenio/alerts/v1", params, AlertsResponse);
	}
}

let defaultClient: CromaClient | null = null;

export function getCromaClient(): CromaClient {
	if (!defaultClient) {
		const apiKey = process.env.CROMA_API_KEY;
		if (!apiKey) {
			throw new Error(
				"CROMA_API_KEY environment variable is required. Get a key at https://usecroma.com",
			);
		}
		defaultClient = new CromaClient({ apiKey });
	}
	return defaultClient;
}

export function createCromaClient(config: CromaClientConfig): CromaClient {
	return new CromaClient(config);
}
