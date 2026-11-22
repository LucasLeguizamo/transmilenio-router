import { describe, it, expect } from "vitest";
import {
	StopsSearchResponse,
	AlertsResponse,
} from "../src/lib/croma/types";
import stopsNullDistance from "./__fixtures__/croma-stops-search-null-distance.json";
import alertsNullableRoutes from "./__fixtures__/croma-alerts-nullable-routes.json";

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
});
