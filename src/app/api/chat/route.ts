import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";
import { createMCPTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 30;

function getTools() {
	return createMCPTools();
}

export async function POST(req: Request) {
	const { messages } = await req.json();
	const mcpTools = getTools();

	const result = streamText({
		model: openai("gpt-4o-mini"),
		system: `You are a helpful assistant that helps people navigate Bogotá's TransMilenio public transit system.

You have access to tools that query live TransMilenio data:
- plan_route: Plan a route between two locations
- find_stops: Find TransMilenio and SITP stops
- stop_arrivals: Get live arrival times at a stop
- service_alerts: Get current service alerts

When users ask about routes, stops, or transit information in Bogotá, use these tools to provide accurate, up-to-date information.

Always be helpful and provide context about the TransMilenio system when relevant. If a route cannot be found, suggest alternatives or explain why.`,
		messages,
		tools: {
			plan_route: tool({
				description:
					"Plan a TransMilenio route between two locations in Bogotá",
				parameters: z.object({
					origin: z
						.string()
						.describe("Origin location (address, landmark, or station name)"),
					destination: z
						.string()
						.describe("Destination location"),
					maxWalkMeters: z
						.number()
						.optional()
						.describe("Maximum walking distance"),
					maxTransfers: z
						.number()
						.optional()
						.describe("Maximum transfers"),
				}),
				execute: async (params) => {
					const result = await mcpTools.planRoute(params);
					return result.content[0].text;
				},
			}),
			find_stops: tool({
				description: "Find TransMilenio and SITP stops by name, location, or route",
				parameters: z.object({
					query: z.string().optional().describe("Search by name or code"),
					latitude: z.number().optional().describe("Latitude"),
					longitude: z.number().optional().describe("Longitude"),
					radiusMeters: z.number().optional().describe("Search radius"),
					route: z.string().optional().describe("Filter by route code"),
					limit: z.number().optional().describe("Max results"),
				}),
				execute: async (params) => {
					const result = await mcpTools.findStops(params);
					return result.content[0].text;
				},
			}),
			stop_arrivals: tool({
				description: "Get live arrival times at a TransMilenio or SITP stop",
				parameters: z.object({
					stopId: z.string().describe("Stop ID"),
					route: z.string().optional().describe("Filter by route"),
					limit: z.number().optional().describe("Max arrivals"),
				}),
				execute: async (params) => {
					const result = await mcpTools.getStopArrivals(params);
					return result.content[0].text;
				},
			}),
			service_alerts: tool({
				description: "Get current TransMilenio and SITP service alerts",
				parameters: z.object({
					route: z.string().optional().describe("Filter by route"),
					stopId: z.string().optional().describe("Filter by stop"),
				}),
				execute: async (params) => {
					const result = await mcpTools.getServiceAlerts(params);
					return result.content[0].text;
				},
			}),
		},
	});

	return result.toDataStreamResponse();
}
