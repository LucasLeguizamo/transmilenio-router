import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ListResourcesRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
	createMCPTools,
	PlanRouteInput,
	FindStopsInput,
	StopArrivalsInput,
	ServiceAlertsInput,
} from "./tools";

const TOOLS = [
	{
		name: "plan_route",
		description:
			"Plan a TransMilenio route between two locations in Bogotá. Returns step-by-step directions with an interactive map showing the route, stations, and estimated travel time.",
		inputSchema: {
			type: "object" as const,
			properties: {
				origin: {
					type: "string",
					description:
						"Origin location as text (address, landmark, or station name) or coordinates in 'lat,lon' format",
				},
				destination: {
					type: "string",
					description:
						"Destination location as text (address, landmark, or station name) or coordinates in 'lat,lon' format",
				},
				maxWalkMeters: {
					type: "number",
					description: "Maximum walking distance in meters (default 800)",
				},
				maxTransfers: {
					type: "number",
					description: "Maximum number of transfers (default 2)",
				},
			},
			required: ["origin", "destination"],
		},
	},
	{
		name: "find_stops",
		description:
			"Find TransMilenio and SITP stops/stations by name, location, or route. Returns a map showing stop locations with route information.",
		inputSchema: {
			type: "object" as const,
			properties: {
				query: {
					type: "string",
					description: "Search by station/stop name or code",
				},
				latitude: {
					type: "number",
					description: "Latitude for proximity search",
				},
				longitude: {
					type: "number",
					description: "Longitude for proximity search",
				},
				radiusMeters: {
					type: "number",
					description: "Search radius in meters (default 500, max 5000)",
				},
				route: {
					type: "string",
					description: "Filter by route code (e.g., 'B10', 'K86')",
				},
				limit: {
					type: "number",
					description: "Maximum number of stops to return (default 10)",
				},
			},
		},
	},
	{
		name: "stop_arrivals",
		description:
			"Get live arrival times for buses at a TransMilenio or SITP stop. Shows real-time predictions when available.",
		inputSchema: {
			type: "object" as const,
			properties: {
				stopId: {
					type: "string",
					description: "Stop ID to get arrivals for",
				},
				route: {
					type: "string",
					description: "Filter by route code",
				},
				limit: {
					type: "number",
					description: "Maximum arrivals to return (default 10)",
				},
			},
			required: ["stopId"],
		},
	},
	{
		name: "service_alerts",
		description:
			"Get current service alerts for TransMilenio and SITP, including detours, delays, and service disruptions.",
		inputSchema: {
			type: "object" as const,
			properties: {
				route: {
					type: "string",
					description: "Filter alerts by route code",
				},
				stopId: {
					type: "string",
					description: "Filter alerts by stop ID",
				},
			},
		},
	},
];

export function createMCPServer(): Server {
	const server = new Server(
		{
			name: "transmilenio-mcp",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
				resources: {},
			},
		},
	);

	const tools = createMCPTools();

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return { tools: TOOLS };
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		switch (name) {
			case "plan_route": {
				const input = PlanRouteInput.parse(args);
				return tools.planRoute(input);
			}
			case "find_stops": {
				const input = FindStopsInput.parse(args);
				return tools.findStops(input);
			}
			case "stop_arrivals": {
				const input = StopArrivalsInput.parse(args);
				return tools.getStopArrivals(input);
			}
			case "service_alerts": {
				const input = ServiceAlertsInput.parse(args);
				return tools.getServiceAlerts(input);
			}
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	});

	server.setRequestHandler(ListResourcesRequestSchema, async () => {
		return { resources: [] };
	});

	server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
		const uri = request.params.uri;

		if (uri.startsWith("ui://transmilenio-mcp/")) {
			const url = new URL(uri.replace("ui://", "https://"));
			const dataParam = url.searchParams.get("data");

			if (!dataParam) {
				throw new Error("Missing data parameter in UI resource URI");
			}

			return {
				contents: [
					{
						uri,
						mimeType: "application/json",
						text: decodeURIComponent(dataParam),
					},
				],
			};
		}

		throw new Error(`Unknown resource: ${uri}`);
	});

	return server;
}

export async function runMCPServer(): Promise<void> {
	const server = createMCPServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
