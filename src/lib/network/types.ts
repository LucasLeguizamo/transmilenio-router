import { z } from "zod";
import type { TransitSystem } from "../croma/types";

export const NETWORK_SNAPSHOT_VERSION = 1 as const;
export const NETWORK_GRAPH_VERSION = 1 as const;

export type NetworkStop = {
	id: string;
	code: string | null;
	name: string;
	kind: string;
	lat: number;
	lon: number;
	parent: string | null;
	platforms: string[];
	systems: string[];
	route_ids: string[];
	route_codes: string[];
};

export type NetworkPatternStop = {
	id: string;
	seq: number;
	offset: number | null;
	name: string | null;
	lat: number | null;
	lon: number | null;
};

export type NetworkPattern = {
	shape_id: string | null;
	stops: NetworkPatternStop[];
};

export type NetworkRoute = {
	id: string;
	code: string | null;
	name: string | null;
	system: TransitSystem | string;
	color: string | null;
	patterns: NetworkPattern[];
};

export type NetworkSnapshot = {
	version: typeof NETWORK_SNAPSHOT_VERSION;
	fetched_at: string;
	source: "croma";
	as_of: string | null;
	counts: {
		stops: number;
		routes: number;
		patterns: number;
	};
	stops: NetworkStop[];
	routes: NetworkRoute[];
};

export type WalkEdge = {
	from: string;
	to: string;
	meters: number;
};

export type NetworkGraph = {
	version: typeof NETWORK_GRAPH_VERSION;
	built_at: string;
	snapshot_fetched_at: string;
	stop_to_routes: Record<string, string[]>;
	route_patterns: Record<
		string,
		Array<{ shape_id: string | null; stop_ids: string[]; offsets: Array<number | null> }>
	>;
	walk_edges: WalkEdge[];
	station_platforms: Record<string, string[]>;
	platform_station: Record<string, string>;
};

export type SyncPhase =
	| "stops"
	| "routes_list"
	| "routes_detail"
	| "build"
	| "done";

export type SyncState = {
	version: 1;
	updated_at: string;
	phase: SyncPhase;
	stops_page: number;
	routes_system_index: number;
	routes_page: number;
	route_ids: string[];
	route_ids_done: string[];
	stops: NetworkStop[];
	routes: NetworkRoute[];
	as_of: string | null;
	errors: string[];
};

export const NetworkSnapshotSchema = z.object({
	version: z.literal(1),
	fetched_at: z.string(),
	source: z.literal("croma"),
	as_of: z.string().nullable(),
	counts: z.object({
		stops: z.number(),
		routes: z.number(),
		patterns: z.number(),
	}),
	stops: z.array(
		z.object({
			id: z.string(),
			code: z.string().nullable(),
			name: z.string(),
			kind: z.string(),
			lat: z.number(),
			lon: z.number(),
			parent: z.string().nullable(),
			platforms: z.array(z.string()),
			systems: z.array(z.string()),
			route_ids: z.array(z.string()),
			route_codes: z.array(z.string()),
		}),
	),
	routes: z.array(
		z.object({
			id: z.string(),
			code: z.string().nullable(),
			name: z.string().nullable(),
			system: z.string(),
			color: z.string().nullable(),
			patterns: z.array(
				z.object({
					shape_id: z.string().nullable(),
					stops: z.array(
						z.object({
							id: z.string(),
							seq: z.number(),
							offset: z.number().nullable(),
							name: z.string().nullable(),
							lat: z.number().nullable(),
							lon: z.number().nullable(),
						}),
					),
				}),
			),
		}),
	),
});
