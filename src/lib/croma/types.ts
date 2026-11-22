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

const RouteRef = z.object({
	route_id: z.string(),
	short_name: z.string().nullable(),
	long_name: z.string().nullable(),
});

export const Stop = z.object({
	stop_id: z.string(),
	code: z.string().nullable(),
	name: z.string(),
	kind: StopKind,
	parent_station: z.string().nullable(),
	latitude: z.number(),
	longitude: z.number(),
	wheelchair_boarding: WheelchairBoarding.nullable(),
	zone_id: z.string().nullable(),
	route_ids: z.array(z.string()),
	route_codes: z.array(z.string()),
	routes: z.array(RouteRef).optional(),
	distance_m: z.number().optional(),
});
export type Stop = z.infer<typeof Stop>;

export const StopsSearchResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		query: z.string().optional(),
		route: z.string().nullable().optional(),
		kind: z.string().nullable().optional(),
		latitude: z.number().nullable().optional(),
		longitude: z.number().nullable().optional(),
		radius_m: z.number().nullable().optional(),
		total: z.number(),
		total_is_exact: z.boolean(),
		page: z.number(),
		per_page: z.number(),
		total_pages: z.number(),
		count: z.number(),
		stops: z.array(Stop),
	}),
});
export type StopsSearchResponse = z.infer<typeof StopsSearchResponse>;

export const StopResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		found: z.boolean(),
		stop_id: z.string(),
		stop: Stop.nullable(),
	}),
});
export type StopResponse = z.infer<typeof StopResponse>;

const RouteStop = z.object({
	stop_id: z.string(),
	code: z.string().nullable(),
	name: z.string(),
	latitude: z.number(),
	longitude: z.number(),
	minutes: z.number().nullable(),
});

const RoutePattern = z.object({
	pattern_id: z.string(),
	headsign: z.string().nullable(),
	direction: z.number().nullable(),
	stops: z.array(RouteStop),
	geometry: z
		.object({
			type: z.literal("LineString"),
			coordinates: z.array(z.tuple([z.number(), z.number()])),
		})
		.nullable()
		.optional(),
});

const RouteService = z.object({
	service_id: z.string(),
	monday: z.boolean(),
	tuesday: z.boolean(),
	wednesday: z.boolean(),
	thursday: z.boolean(),
	friday: z.boolean(),
	saturday: z.boolean(),
	sunday: z.boolean(),
});

export const Route = z.object({
	route_id: z.string(),
	short_name: z.string().nullable(),
	long_name: z.string().nullable(),
	system: TransitSystem,
	system_name: z.string().nullable(),
	mode: TransitMode,
	color: z.string().nullable(),
	text_color: z.string().nullable(),
	stops_count: z.number(),
	trips_per_week: z.number(),
	first_departure: z.string().nullable(),
	last_departure: z.string().nullable(),
	services: z.array(RouteService).optional(),
	patterns: z.array(RoutePattern).optional(),
});
export type Route = z.infer<typeof Route>;

export const RoutesSearchResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		query: z.string().optional(),
		system: z.string().nullable().optional(),
		stop_id: z.string().nullable().optional(),
		total: z.number(),
		total_is_exact: z.boolean(),
		page: z.number(),
		per_page: z.number(),
		total_pages: z.number(),
		count: z.number(),
		routes: z.array(Route),
	}),
});
export type RoutesSearchResponse = z.infer<typeof RoutesSearchResponse>;

export const RouteResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		found: z.boolean(),
		route_id: z.string(),
		route: Route.nullable(),
	}),
});
export type RouteResponse = z.infer<typeof RouteResponse>;

export const Arrival = z.object({
	predicted_at: z.string().nullable(),
	minutes_away: z.number().nullable(),
	basis: ArrivalBasis,
	delay_seconds: z.number().nullable(),
	stop_id: z.string(),
	route_id: z.string().nullable(),
	route_code: z.string().nullable(),
	route_name: z.string().nullable(),
	system: TransitSystem.nullable(),
	trip_id: z.string().nullable(),
	vehicle_id: z.string().nullable(),
	vehicle_label: z.string().nullable(),
});
export type Arrival = z.infer<typeof Arrival>;

export const StopArrivalsResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		live: z.boolean(),
		notice: z.string().nullable(),
		found: z.boolean(),
		stop_id: z.string(),
		stop_name: z.string().nullable(),
		route: z.string().nullable(),
		count: z.number(),
		arrivals: z.array(Arrival),
	}),
});
export type StopArrivalsResponse = z.infer<typeof StopArrivalsResponse>;

export const Departure = z.object({
	time: z.string(),
	at: z.string(),
	minutes_from_now: z.number().nullable(),
	route_id: z.string(),
	route_code: z.string().nullable(),
	route_name: z.string().nullable(),
	system: TransitSystem,
	stop_id: z.string(),
});
export type Departure = z.infer<typeof Departure>;

export const StopDeparturesResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		found: z.boolean(),
		stop_id: z.string(),
		stop_name: z.string().nullable(),
		date: z.string(),
		from_time: z.string(),
		route: z.string().nullable(),
		services: z.array(z.string()),
		count: z.number(),
		departures: z.array(Departure),
	}),
});
export type StopDeparturesResponse = z.infer<typeof StopDeparturesResponse>;

export const Vehicle = z.object({
	vehicle_id: z.string().nullable(),
	label: z.string().nullable(),
	license_plate: z.string().nullable(),
	latitude: z.number(),
	longitude: z.number(),
	bearing: z.number().nullable(),
	speed_kmh: z.number().nullable(),
	route_id: z.string().nullable(),
	route_code: z.string().nullable(),
	route_name: z.string().nullable(),
	system: TransitSystem.nullable(),
	trip_id: z.string().nullable(),
	current_stop_id: z.string().nullable(),
	next_stop_id: z.string().nullable(),
});
export type Vehicle = z.infer<typeof Vehicle>;

export const VehiclesResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		live: z.boolean(),
		notice: z.string().nullable(),
		route: z.string().nullable(),
		latitude: z.number().nullable(),
		longitude: z.number().nullable(),
		radius_m: z.number().nullable(),
		total: z.number(),
		page: z.number(),
		per_page: z.number(),
		total_pages: z.number(),
		count: z.number(),
		vehicles: z.array(Vehicle),
	}),
});
export type VehiclesResponse = z.infer<typeof VehiclesResponse>;

const AlertRoute = z.object({
	route_id: z.string(),
	route_code: z.string().nullable(),
	route_name: z.string().nullable(),
});

const AlertStop = z.object({
	stop_id: z.string(),
	name: z.string().nullable(),
});

const AlertPeriod = z.object({
	start: z.string().nullable(),
	end: z.string().nullable(),
});

export const Alert = z.object({
	alert_id: z.string(),
	cause: z.string().nullable(),
	effect: z.string().nullable(),
	header: z.string().nullable(),
	description: z.string().nullable(),
	url: z.string().nullable(),
	active_periods: z.array(AlertPeriod),
	routes: z.array(AlertRoute),
	stops: z.array(AlertStop),
});
export type Alert = z.infer<typeof Alert>;

export const AlertsResponse = z.object({
	data: z.object({
		as_of: z.string().nullable(),
		route: z.string().nullable(),
		stop_id: z.string().nullable(),
		count: z.number(),
		alerts: z.array(Alert),
	}),
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
