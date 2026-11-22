import { z } from "zod";

export const StopKind = z.enum([
	"stop",
	"station",
	"entrance",
	"node",
	"boarding_area",
]);
export type StopKind = z.infer<typeof StopKind>;

export const WheelchairBoarding = z.enum(["accessible", "not_accessible"]);
export type WheelchairBoarding = z.infer<typeof WheelchairBoarding>;

export const TransitSystem = z.enum([
	"troncal",
	"alimentador",
	"dual",
	"zonal_urbano",
	"zonal_complementario",
	"zonal_especial",
	"transmicable",
	"other",
]);
export type TransitSystem = z.infer<typeof TransitSystem>;

export const TransitMode = z.enum(["bus", "gondola", "rail", "other"]);
export type TransitMode = z.infer<typeof TransitMode>;

export const ArrivalBasis = z.enum(["predicted", "estimated", "scheduled"]);
export type ArrivalBasis = z.infer<typeof ArrivalBasis>;

/** OpenAPI marks many string fields as `string | null` and required. */
const NullableString = z.string().nullable();
const NullableNumber = z.number().nullable();

const RouteRef = z
	.object({
		route_id: z.string(),
		short_name: NullableString,
		long_name: NullableString,
		system: TransitSystem.optional(),
	})
	.passthrough();

export const Stop = z
	.object({
		stop_id: z.string(),
		code: NullableString,
		name: z.string(),
		kind: StopKind,
		parent_station: NullableString,
		latitude: z.number(),
		longitude: z.number(),
		wheelchair_boarding: WheelchairBoarding.nullable(),
		zone_id: NullableString,
		route_ids: z.array(z.string()),
		route_codes: z.array(z.string()),
		routes: z.array(RouteRef).optional(),
		systems: z.array(z.string()).optional(),
		/** Station → platform stop_ids (OpenAPI: string[]). */
		platforms: z.array(z.string()).optional(),
		address: NullableString.optional(),
		street: NullableString.optional(),
		locality: NullableString.optional(),
		wagons: NullableNumber.optional(),
		entrances: NullableNumber.optional(),
		// OpenAPI: integer | null; null when search has no reference point
		distance_m: NullableNumber.optional(),
	})
	.passthrough();
export type Stop = z.infer<typeof Stop>;

export const StopsSearchResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			query: z.string().optional(),
			route: NullableString.optional(),
			kind: NullableString.optional(),
			latitude: NullableNumber.optional(),
			longitude: NullableNumber.optional(),
			radius_m: NullableNumber.optional(),
			total: z.number(),
			total_is_exact: z.boolean(),
			page: z.number(),
			per_page: z.number(),
			total_pages: z.number(),
			count: z.number(),
			stops: z.array(Stop),
		})
		.passthrough(),
});
export type StopsSearchResponse = z.infer<typeof StopsSearchResponse>;

export const StopResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			found: z.boolean(),
			stop_id: z.string(),
			stop: Stop.nullable(),
		})
		.passthrough(),
});
export type StopResponse = z.infer<typeof StopResponse>;

/** Pattern stop as returned by Croma route/v1 (not our old minutes-based guess). */
const RouteStop = z
	.object({
		sequence: z.number().optional(),
		stop_id: z.string(),
		code: NullableString,
		name: NullableString,
		latitude: NullableNumber,
		longitude: NullableNumber,
		offset_seconds: NullableNumber.optional(),
		// Tolerate older/fixture shapes
		minutes: NullableNumber.optional(),
	})
	.passthrough();
export type RouteStop = z.infer<typeof RouteStop>;

const RoutePattern = z
	.object({
		shape_id: NullableString.optional(),
		// Tolerate older/fixture field names
		pattern_id: z.string().optional(),
		headsign: NullableString.optional(),
		direction: NullableNumber.optional(),
		trips_per_week: z.number().optional(),
		length_m: NullableNumber.optional(),
		stops: z.array(RouteStop),
		geometry: z
			.object({
				type: z.literal("LineString"),
				coordinates: z.array(z.array(z.number())),
			})
			.nullable()
			.optional(),
	})
	.passthrough();
export type RoutePattern = z.infer<typeof RoutePattern>;

const RouteService = z
	.object({
		service_id: z.string(),
		days: z.array(z.string()).optional(),
		trips: z.number().optional(),
		first_departure: NullableString.optional(),
		last_departure: NullableString.optional(),
	})
	.passthrough();

export const Route = z
	.object({
		route_id: z.string(),
		short_name: NullableString,
		long_name: NullableString,
		system: TransitSystem,
		system_name: NullableString,
		mode: TransitMode,
		color: NullableString,
		text_color: NullableString,
		stops_count: z.number(),
		trips_per_week: z.number(),
		first_departure: NullableString,
		last_departure: NullableString,
		services: z.array(RouteService).optional(),
		patterns: z.array(RoutePattern).optional(),
		origin: NullableString.optional(),
		destination: NullableString.optional(),
		headways: z.array(z.unknown()).optional(),
		hours: z.unknown().optional(),
	})
	.passthrough();
export type Route = z.infer<typeof Route>;

export const RoutesSearchResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			query: z.string().optional(),
			system: NullableString.optional(),
			stop_id: NullableString.optional(),
			total: z.number(),
			total_is_exact: z.boolean(),
			page: z.number(),
			per_page: z.number(),
			total_pages: z.number(),
			count: z.number(),
			routes: z.array(Route),
		})
		.passthrough(),
});
export type RoutesSearchResponse = z.infer<typeof RoutesSearchResponse>;

export const RouteResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			found: z.boolean(),
			route_id: z.string(),
			route: Route.nullable(),
		})
		.passthrough(),
});
export type RouteResponse = z.infer<typeof RouteResponse>;

export const Arrival = z
	.object({
		predicted_at: NullableString,
		minutes_away: NullableNumber,
		basis: ArrivalBasis,
		delay_seconds: NullableNumber,
		stop_id: z.string(),
		route_id: NullableString,
		route_code: NullableString,
		route_name: NullableString,
		system: TransitSystem.nullable(),
		trip_id: NullableString,
		vehicle_id: NullableString,
		vehicle_label: NullableString,
	})
	.passthrough();
export type Arrival = z.infer<typeof Arrival>;

export const StopArrivalsResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			live: z.boolean(),
			notice: NullableString,
			found: z.boolean(),
			stop_id: z.string(),
			stop_name: NullableString,
			route: NullableString,
			count: z.number(),
			arrivals: z.array(Arrival),
		})
		.passthrough(),
});
export type StopArrivalsResponse = z.infer<typeof StopArrivalsResponse>;

export const Departure = z
	.object({
		time: z.string(),
		at: z.string(),
		minutes_from_now: NullableNumber,
		route_id: z.string(),
		route_code: NullableString,
		route_name: NullableString,
		system: TransitSystem,
		stop_id: z.string(),
	})
	.passthrough();
export type Departure = z.infer<typeof Departure>;

export const StopDeparturesResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			found: z.boolean(),
			stop_id: z.string(),
			stop_name: NullableString,
			date: z.string(),
			from_time: z.string(),
			route: NullableString,
			services: z.array(z.string()),
			count: z.number(),
			departures: z.array(Departure),
		})
		.passthrough(),
});
export type StopDeparturesResponse = z.infer<typeof StopDeparturesResponse>;

export const Vehicle = z
	.object({
		vehicle_id: NullableString,
		label: NullableString,
		license_plate: NullableString,
		latitude: z.number(),
		longitude: z.number(),
		bearing: NullableNumber,
		speed_kmh: NullableNumber,
		route_id: NullableString,
		route_code: NullableString,
		route_name: NullableString,
		system: TransitSystem.nullable(),
		trip_id: NullableString,
		current_stop_id: NullableString,
		next_stop_id: NullableString,
	})
	.passthrough();
export type Vehicle = z.infer<typeof Vehicle>;

export const VehiclesResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			live: z.boolean(),
			notice: NullableString,
			route: NullableString,
			latitude: NullableNumber,
			longitude: NullableNumber,
			radius_m: NullableNumber,
			total: z.number(),
			page: z.number(),
			per_page: z.number(),
			total_pages: z.number(),
			count: z.number(),
			vehicles: z.array(Vehicle),
		})
		.passthrough(),
});
export type VehiclesResponse = z.infer<typeof VehiclesResponse>;

const AlertRoute = z
	.object({
		route_id: z.string(),
		route_code: NullableString,
		route_name: NullableString,
	})
	.passthrough();

const AlertStop = z
	.object({
		stop_id: z.string(),
		name: NullableString,
	})
	.passthrough();

const AlertPeriod = z
	.object({
		start: NullableString,
		end: NullableString,
	})
	.passthrough();

export const Alert = z
	.object({
		alert_id: z.string(),
		cause: NullableString,
		effect: NullableString,
		header: NullableString,
		description: NullableString,
		url: NullableString,
		active_periods: z.array(AlertPeriod),
		routes: z.array(AlertRoute),
		stops: z.array(AlertStop),
	})
	.passthrough();
export type Alert = z.infer<typeof Alert>;

export const AlertsResponse = z.object({
	data: z
		.object({
			as_of: NullableString,
			route: NullableString,
			stop_id: NullableString,
			count: z.number(),
			alerts: z.array(Alert),
		})
		.passthrough(),
});
export type AlertsResponse = z.infer<typeof AlertsResponse>;

export type Coordinates = {
	latitude: number;
	longitude: number;
};

export type StopsSearchParams = {
	query?: string;
	route?: string;
	kind?: "" | "station" | "stop";
	latitude?: number;
	longitude?: number;
	radius_m?: number;
	page?: number;
	per_page?: number;
};

export type RoutesSearchParams = {
	query?: string;
	system?: TransitSystem | "";
	stop_id?: string;
	page?: number;
	per_page?: number;
};

export type StopArrivalsParams = {
	stop_id: string;
	route?: string;
	limit?: number;
};

export type StopDeparturesParams = {
	stop_id: string;
	date?: string;
	from_time?: string;
	route?: string;
	limit?: number;
};

export type VehiclesParams = {
	route?: string;
	latitude?: number;
	longitude?: number;
	radius_m?: number;
	page?: number;
	per_page?: number;
};

export type AlertsParams = {
	route?: string;
	stop_id?: string;
};

export type CromaError = {
	kind: "error";
	status: number;
	code: string;
	message: string;
};

export type CromaResult<T> =
	| { kind: "success"; data: T }
	| CromaError;
