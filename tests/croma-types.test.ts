import { describe, it, expect } from "vitest";
import {
	StopsSearchResponse,
	AlertsResponse,
	RouteResponse,
} from "../src/lib/croma/types";
import stopsNullDistance from "./__fixtures__/croma-stops-search-null-distance.json";
import alertsNullableRoutes from "./__fixtures__/croma-alerts-nullable-routes.json";
import portalLive from "./__fixtures__/croma-stops-portal-norte-live.json";
import routeB907Live from "./__fixtures__/croma-route-b907-live.json";

describe("Croma response schemas vs live null fields", () => {
	it("accepts stops-search with distance_m null (no reference point)", () => {
		const parsed = StopsSearchResponse.safeParse(stopsNullDistance);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.data.stops[0].distance_m).toBeNull();
			expect(parsed.data.data.stops[0].name).toBe("Portal Norte");
		}
	});

	it("accepts alerts with null route_code and route_name", () => {
		const parsed = AlertsResponse.safeParse(alertsNullableRoutes);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			const route = parsed.data.data.alerts[0].routes[0];
			expect(route.route_code).toBeNull();
			expect(route.route_name).toBeNull();
			expect(route.route_id).toBe("10075");
		}
	});

	it("accepts live-shaped station platforms as string ids and route patterns with offset_seconds", () => {
		const stops = StopsSearchResponse.safeParse(portalLive);
		expect(stops.success).toBe(true);
		if (stops.success) {
			expect(stops.data.data.stops[0].platforms).toEqual(["56496", "56497"]);
			expect(stops.data.data.stops[0].stop_id).toBe("55770");
		}

		const route = RouteResponse.safeParse(routeB907Live);
		expect(route.success).toBe(true);
		if (route.success) {
			const pattern = route.data.data.route?.patterns?.[0];
			expect(pattern?.shape_id).toBe("shape-b907-s");
			expect(pattern?.stops[0].offset_seconds).toBe(0);
			expect(pattern?.stops[0].stop_id).toBe("56496");
		}
	});
});
