import { z } from "zod";
import { CromaClient, getCromaClient } from "../croma/client";
import { findStopsLocal } from "../network/find-stops-local";
import { loadNetworkBundle } from "../network/store";
import type { NetworkStop } from "../network/types";
import { createRoutePlanner, RoutePlanner } from "../routing/planner";
import type { RoutePlan, RoutePlanResult } from "../routing/types";
import type { Stop, Arrival, Alert } from "../croma/types";
import { decodeHtmlEntities } from "../text/html-entities";
import { systemLabel } from "../routing/systems";

function networkStopToStop(stop: NetworkStop, distance_m?: number): Stop {
	return {
		stop_id: stop.id,
		code: stop.code,
		name: stop.name,
		kind: (stop.kind as Stop["kind"]) || "stop",
		parent_station: stop.parent,
		latitude: stop.lat,
		longitude: stop.lon,
		wheelchair_boarding: null,
		zone_id: null,
		route_ids: stop.route_ids,
		route_codes: stop.route_codes,
		systems: stop.systems,
		platforms: stop.platforms,
		distance_m: distance_m ?? null,
	};
}

const DEFAULT_ALERT_LIMIT = 20;

export const PlanRouteInput = z.object({
	origin: z
		.string()
		.describe(
			"Origin location as text (address, landmark, or station name) or coordinates in 'lat,lon' format",
		),
	destination: z
		.string()
		.describe(
			"Destination location as text (address, landmark, or station name) or coordinates in 'lat,lon' format",
		),
	maxWalkMeters: z
		.number()
		.optional()
		.describe("Maximum walking distance in meters (default 800)"),
	maxTransfers: z
		.number()
		.optional()
		.describe("Maximum number of transfers (default 2)"),
	debug: z
		.boolean()
		.optional()
		.describe(
			"When true, include route-search debug (candidate stops, shared codes, outcomes) in the tool result text",
		),
});

export const FindStopsInput = z.object({
	query: z
		.string()
		.optional()
		.describe("Search by station/stop name or code"),
	latitude: z
		.number()
		.optional()
		.describe("Latitude for proximity search"),
	longitude: z
		.number()
		.optional()
		.describe("Longitude for proximity search"),
	radiusMeters: z
		.number()
		.optional()
		.describe("Search radius in meters (default 500, max 5000)"),
	route: z
		.string()
		.optional()
		.describe("Filter by route code (e.g., 'B10', 'K86')"),
	limit: z
		.number()
		.optional()
		.describe("Maximum number of stops to return (default 10)"),
});

export const StopArrivalsInput = z.object({
	stopId: z.string().describe("Stop ID to get arrivals for"),
	route: z
		.string()
		.optional()
		.describe("Filter by route code"),
	limit: z
		.number()
		.optional()
		.describe("Maximum arrivals to return (default 10)"),
});

export const ServiceAlertsInput = z.object({
	route: z
		.string()
		.optional()
		.describe("Filter alerts by route code"),
	stopId: z
		.string()
		.optional()
		.describe("Filter alerts by stop ID"),
	limit: z
		.number()
		.optional()
		.describe(`Maximum alerts to return in the summary (default ${DEFAULT_ALERT_LIMIT})`),
});

function parseLocation(input: string): {
	text?: string;
	latitude?: number;
	longitude?: number;
} {
	const coordMatch = input.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
	if (coordMatch) {
		return {
			latitude: parseFloat(coordMatch[1]),
			longitude: parseFloat(coordMatch[2]),
		};
	}
	return { text: input };
}

function generateRouteMapUI(plan: RoutePlan): string {
	const uiData = {
		type: "route-map",
		plan,
	};
	return `ui://transmilenio-mcp/route-map?data=${encodeURIComponent(JSON.stringify(uiData))}`;
}

function generateStopsMapUI(stops: Stop[], center?: { lat: number; lon: number }): string {
	const uiData = {
		type: "stops-map",
		stops,
		center,
	};
	return `ui://transmilenio-mcp/stops-map?data=${encodeURIComponent(JSON.stringify(uiData))}`;
}

function generateArrivalsUI(
	stopId: string,
	stopName: string,
	arrivals: Arrival[],
): string {
	const uiData = {
		type: "arrivals",
		stopId,
		stopName,
		arrivals,
	};
	return `ui://transmilenio-mcp/arrivals?data=${encodeURIComponent(JSON.stringify(uiData))}`;
}

function sanitizeAlert(alert: Alert): Alert {
	return {
		...alert,
		header: alert.header ? decodeHtmlEntities(alert.header) : alert.header,
		description: alert.description
			? decodeHtmlEntities(alert.description)
			: alert.description,
		routes: alert.routes.map((route) => ({
			...route,
			route_name: route.route_name
				? decodeHtmlEntities(route.route_name)
				: route.route_name,
		})),
		stops: alert.stops.map((stop) => ({
			...stop,
			name: stop.name ? decodeHtmlEntities(stop.name) : stop.name,
		})),
	};
}

function generateAlertsUI(alerts: Alert[], totalCount: number): string {
	const uiData = {
		type: "alerts",
		totalCount,
		shown: alerts.length,
		alerts,
	};
	return `ui://transmilenio-mcp/alerts?data=${encodeURIComponent(JSON.stringify(uiData))}`;
}

export type ToolResult = {
	content: Array<{ type: "text"; text: string }>;
	_meta?: {
		ui?: string;
	};
};

export class MCPTools {
	private client: CromaClient;
	private planner: RoutePlanner;

	constructor(client?: CromaClient) {
		this.client = client ?? getCromaClient();
		this.planner = createRoutePlanner(this.client);
	}

	async planRoute(input: z.infer<typeof PlanRouteInput>): Promise<ToolResult> {
		const origin = parseLocation(input.origin);
		const destination = parseLocation(input.destination);

		const result: RoutePlanResult = await this.planner.planRoute({
			origin,
			destination,
			maxWalkMeters: input.maxWalkMeters,
			maxTransfers: input.maxTransfers,
			debug: input.debug === true,
		});

		const debugSuffix =
			input.debug && result.debug
				? `\n\n--- plan_route debug ---\n${JSON.stringify(result.debug, null, 2)}`
				: "";

		if (result.kind === "error") {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${result.message}${debugSuffix}`,
					},
				],
			};
		}

		if (result.kind === "no_route") {
			return {
				content: [
					{
						type: "text",
						text: `No route found: ${result.reason}${debugSuffix}`,
					},
				],
			};
		}

		const plan = result.plan;
		const summary = this.formatRouteSummary(plan);

		return {
			content: [{ type: "text", text: `${summary}${debugSuffix}` }],
			_meta: {
				ui: generateRouteMapUI(plan),
			},
		};
	}

	async findStops(input: z.infer<typeof FindStopsInput>): Promise<ToolResult> {
		// Prefer local snapshot (0 credits). Fall back to Croma only if missing.
		const bundle = loadNetworkBundle();
		if (bundle) {
			const local = findStopsLocal(bundle, {
				query: input.query,
				latitude: input.latitude,
				longitude: input.longitude,
				radiusMeters: input.radiusMeters,
				route: input.route,
				limit: input.limit ?? 10,
			});
			if (local.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: "No stops found matching your criteria (local network).",
						},
					],
				};
			}
			const stops = local.map((s) =>
				networkStopToStop(
					s,
					input.latitude != null && input.longitude != null
						? undefined
						: undefined,
				),
			);
			const summary = `${this.formatStopsSummary(stops)}\n\n(Source: local network snapshot)`;
			const center =
				input.latitude && input.longitude
					? { lat: input.latitude, lon: input.longitude }
					: undefined;
			return {
				content: [{ type: "text", text: summary }],
				_meta: { ui: generateStopsMapUI(stops, center) },
			};
		}

		const result = await this.client.searchStops({
			query: input.query,
			latitude: input.latitude,
			longitude: input.longitude,
			radius_m: input.radiusMeters,
			route: input.route,
			per_page: input.limit ?? 10,
		});

		if (result.kind === "error") {
			return {
				content: [{ type: "text", text: `Error: ${result.message}` }],
			};
		}

		const stops = result.data.data.stops;
		if (stops.length === 0) {
			return {
				content: [{ type: "text", text: "No stops found matching your criteria." }],
			};
		}

		const summary = this.formatStopsSummary(stops);
		const center =
			input.latitude && input.longitude
				? { lat: input.latitude, lon: input.longitude }
				: undefined;

		return {
			content: [{ type: "text", text: summary }],
			_meta: {
				ui: generateStopsMapUI(stops, center),
			},
		};
	}

	async getStopArrivals(input: z.infer<typeof StopArrivalsInput>): Promise<ToolResult> {
		const result = await this.client.getStopArrivals({
			stop_id: input.stopId,
			route: input.route,
			limit: input.limit ?? 10,
		});

		if (result.kind === "error") {
			return {
				content: [{ type: "text", text: `Error: ${result.message}` }],
			};
		}

		const data = result.data.data;
		if (!data.found) {
			return {
				content: [{ type: "text", text: `Stop not found: ${input.stopId}` }],
			};
		}

		const summary = this.formatArrivalsSummary(data.stop_name ?? input.stopId, data.arrivals, data.live);

		return {
			content: [{ type: "text", text: summary }],
			_meta: {
				ui: generateArrivalsUI(data.stop_id, data.stop_name ?? input.stopId, data.arrivals),
			},
		};
	}

	async getServiceAlerts(input: z.infer<typeof ServiceAlertsInput>): Promise<ToolResult> {
		const result = await this.client.getAlerts({
			route: input.route,
			stop_id: input.stopId,
		});

		if (result.kind === "error") {
			return {
				content: [{ type: "text", text: `Error: ${result.message}` }],
			};
		}

		const alerts = result.data.data.alerts.map(sanitizeAlert);
		if (alerts.length === 0) {
			return {
				content: [{ type: "text", text: "No active service alerts." }],
			};
		}

		const limit = input.limit ?? DEFAULT_ALERT_LIMIT;
		const shown = alerts.slice(0, limit);
		const summary = this.formatAlertsSummary(shown, alerts.length);

		return {
			content: [{ type: "text", text: summary }],
			_meta: {
				ui: generateAlertsUI(shown, alerts.length),
			},
		};
	}

	private formatRouteSummary(plan: RoutePlan): string {
		const lines: string[] = [];
		lines.push(`Route from ${plan.origin.name} to ${plan.destination.name}`);
		lines.push(`Total time: ~${plan.totalMinutes} minutes`);
		lines.push(`Walking: ${plan.totalWalkMinutes} minutes`);
		lines.push(`Transfers: ${plan.transferCount}`);
		lines.push("");
		lines.push("Steps:");

		for (let i = 0; i < plan.segments.length; i++) {
			const segment = plan.segments[i];
			switch (segment.kind) {
				case "walk":
					lines.push(
						`${i + 1}. Walk ${segment.distanceMeters}m to ${segment.to.name} (~${segment.estimatedMinutes} min)`,
					);
					break;
				case "transit": {
					const code = segment.route.short_name ?? segment.route.route_id;
					const system = segment.route.system;
					const label = systemLabel(system);
					lines.push(
						`${i + 1}. Take ${code} (${label}/${system}) from ${segment.boardStop.name} to ${segment.alightStop.name} (~${segment.estimatedMinutes} min)`,
					);
					break;
				}
				case "transfer":
					lines.push(
						`${i + 1}. Transfer at ${segment.fromStop.name}${
							segment.fromStop.stop_id !== segment.toStop.stop_id
								? ` → ${segment.toStop.name}`
								: ""
						} (~${segment.walkMinutes} min)`,
					);
					break;
				default: {
					const _exhaustive: never = segment;
					void _exhaustive;
					break;
				}
			}
		}

		if (plan.alerts.length > 0) {
			lines.push("");
			lines.push(`⚠️ ${plan.alerts.length} service alert(s) affecting this route`);
		}

		if (plan.limitations.length > 0) {
			lines.push("");
			lines.push("Note: " + plan.limitations[0]);
		}

		return lines.join("\n");
	}

	private formatStopsSummary(stops: Stop[]): string {
		const lines: string[] = [];
		lines.push(`Found ${stops.length} stop(s):`);
		lines.push("");

		for (const stop of stops) {
			const routes = stop.route_codes.slice(0, 5).join(", ");
			const moreRoutes = stop.route_codes.length > 5 ? ` +${stop.route_codes.length - 5} more` : "";
			const distance =
				stop.distance_m != null
					? ` (${Math.round(stop.distance_m)}m away)`
					: "";
			lines.push(`• ${stop.name}${distance}`);
			lines.push(`  ID: ${stop.stop_id} | Routes: ${routes}${moreRoutes}`);
		}

		return lines.join("\n");
	}

	private formatArrivalsSummary(
		stopName: string,
		arrivals: Arrival[],
		isLive: boolean,
	): string {
		const lines: string[] = [];
		lines.push(`Arrivals at ${stopName}`);
		lines.push(isLive ? "(Live data)" : "(Scheduled data)");
		lines.push("");

		if (arrivals.length === 0) {
			lines.push("No upcoming arrivals");
			return lines.join("\n");
		}

		for (const arrival of arrivals) {
			const route = arrival.route_code ?? arrival.route_id ?? "Unknown";
			const time =
				arrival.minutes_away !== null
					? `${arrival.minutes_away} min`
					: arrival.predicted_at ?? "Unknown";
			const delay =
				arrival.delay_seconds !== null && arrival.delay_seconds > 60
					? ` (${Math.round(arrival.delay_seconds / 60)} min late)`
					: "";
			lines.push(`• ${route}: ${time}${delay}`);
		}

		return lines.join("\n");
	}

	private formatAlertsSummary(alerts: Alert[], totalCount: number): string {
		const lines: string[] = [];
		if (alerts.length < totalCount) {
			lines.push(
				`Showing ${alerts.length} of ${totalCount} service alert(s):`,
			);
		} else {
			lines.push(`${totalCount} Service Alert(s):`);
		}
		lines.push("");

		for (const alert of alerts) {
			const effect = alert.effect ?? "Unknown effect";
			const header = alert.header ?? "No description";
			lines.push(`⚠️ ${effect.toUpperCase()}`);
			lines.push(`   ${header}`);
			if (alert.routes.length > 0) {
				const routes = alert.routes
					.map((r) => r.route_code ?? r.route_id)
					.join(", ");
				lines.push(`   Affects: ${routes}`);
			}
			lines.push("");
		}

		if (alerts.length < totalCount) {
			lines.push(
				`…and ${totalCount - alerts.length} more. Pass limit or filter by route/stopId.`,
			);
		}

		return lines.join("\n");
	}
}

export function createMCPTools(client?: CromaClient): MCPTools {
	return new MCPTools(client);
}
