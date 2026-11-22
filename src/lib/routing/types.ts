import type { Stop, Alert, Arrival, TransitSystem } from "../croma/types";

export type RouteSegment = {
	kind: "transit";
	route: {
		route_id: string;
		short_name: string | null;
		long_name: string | null;
		system: TransitSystem;
		color: string | null;
	};
	boardStop: {
		stop_id: string;
		name: string;
		latitude: number;
		longitude: number;
	};
	alightStop: {
		stop_id: string;
		name: string;
		latitude: number;
		longitude: number;
	};
	intermediateStops: Array<{
		stop_id: string;
		name: string;
		latitude: number;
		longitude: number;
	}>;
	estimatedMinutes: number | null;
	geometry: Array<[number, number]> | null;
};

export type WalkSegment = {
	kind: "walk";
	from: {
		latitude: number;
		longitude: number;
		name: string;
	};
	to: {
		stop_id: string;
		name: string;
		latitude: number;
		longitude: number;
	};
	distanceMeters: number;
	estimatedMinutes: number;
};

export type TransferSegment = {
	kind: "transfer";
	fromStop: {
		stop_id: string;
		name: string;
		latitude: number;
		longitude: number;
	};
	toStop: {
		stop_id: string;
		name: string;
		latitude: number;
		longitude: number;
	};
	walkMinutes: number;
};

export type RoutePlanSegment = RouteSegment | WalkSegment | TransferSegment;

export type RoutePlan = {
	origin: {
		latitude: number;
		longitude: number;
		name: string;
	};
	destination: {
		latitude: number;
		longitude: number;
		name: string;
	};
	segments: RoutePlanSegment[];
	totalMinutes: number;
	totalWalkMinutes: number;
	transferCount: number;
	alerts: Alert[];
	timestamp: string;
	limitations: string[];
};

export type RoutePlanRequest = {
	origin: {
		text?: string;
		latitude?: number;
		longitude?: number;
	};
	destination: {
		text?: string;
		latitude?: number;
		longitude?: number;
	};
	maxWalkMeters?: number;
	maxTransfers?: number;
};

export type RoutePlanResult =
	| { kind: "success"; plan: RoutePlan }
	| { kind: "no_route"; reason: string }
	| { kind: "error"; message: string };

export type StopWithArrivals = Stop & {
	arrivals: Arrival[];
};
