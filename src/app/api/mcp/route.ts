import { createMCPTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";

function getTools() {
	return createMCPTools();
}

const TOOL_LIST = [
	{
		name: "plan_route",
		description: "Plan a TransMilenio route between two locations in Bogotá",
		inputSchema: {
			type: "object",
			properties: {
				origin: { type: "string", description: "Origin location" },
				destination: { type: "string", description: "Destination location" },
				maxWalkMeters: { type: "number", description: "Maximum walking distance" },
				maxTransfers: { type: "number", description: "Maximum transfers" },
			},
			required: ["origin", "destination"],
		},
	},
	{
		name: "find_stops",
		description: "Find TransMilenio and SITP stops",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search by name" },
				latitude: { type: "number", description: "Latitude" },
				longitude: { type: "number", description: "Longitude" },
				radiusMeters: { type: "number", description: "Search radius" },
				route: { type: "string", description: "Filter by route" },
				limit: { type: "number", description: "Max results" },
			},
		},
	},
	{
		name: "stop_arrivals",
		description: "Get live arrival times at a stop",
		inputSchema: {
			type: "object",
			properties: {
				stopId: { type: "string", description: "Stop ID" },
				route: { type: "string", description: "Filter by route" },
				limit: { type: "number", description: "Max arrivals" },
			},
			required: ["stopId"],
		},
	},
	{
		name: "service_alerts",
		description: "Get current service alerts",
		inputSchema: {
			type: "object",
			properties: {
				route: { type: "string", description: "Filter by route" },
				stopId: { type: "string", description: "Filter by stop" },
			},
		},
	},
];

export async function POST(request: Request) {
	const body = await request.json();

	try {
		if (body.method === "tools/list") {
			return Response.json({
				jsonrpc: "2.0",
				result: { tools: TOOL_LIST },
				id: body.id,
			});
		}

		if (body.method === "tools/call") {
			const { name, arguments: args } = body.params;
			const tools = getTools();
			let result;

			switch (name) {
				case "plan_route":
					result = await tools.planRoute(args);
					break;
				case "find_stops":
					result = await tools.findStops(args);
					break;
				case "stop_arrivals":
					result = await tools.getStopArrivals(args);
					break;
				case "service_alerts":
					result = await tools.getServiceAlerts(args);
					break;
				default:
					throw new Error(`Unknown tool: ${name}`);
			}

			return Response.json({
				jsonrpc: "2.0",
				result,
				id: body.id,
			});
		}

		return Response.json({
			jsonrpc: "2.0",
			error: { code: -32601, message: "Method not found" },
			id: body.id,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return Response.json(
			{
				jsonrpc: "2.0",
				error: { code: -32603, message },
				id: body.id ?? null,
			},
			{ status: 500 },
		);
	}
}

export async function GET() {
	return Response.json({
		name: "transmilenio-mcp",
		version: "0.1.0",
		description: "MCP server for TransMilenio route planning",
		tools: ["plan_route", "find_stops", "stop_arrivals", "service_alerts"],
	});
}
