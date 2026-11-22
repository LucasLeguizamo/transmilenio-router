import { describe, it, expect } from "vitest";

function haversineDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function walkMinutes(distanceMeters: number): number {
	return Math.ceil((distanceMeters / 1000 / 4.5) * 60);
}

describe("routing helpers", () => {
	it("computes distance between Portal Norte and Calle 100", () => {
		const meters = haversineDistance(4.7616, -74.0463, 4.68, -74.055);
		expect(meters).toBeGreaterThan(8000);
		expect(meters).toBeLessThan(12000);
	});

	it("estimates walking time from distance", () => {
		expect(walkMinutes(450)).toBe(6);
		expect(walkMinutes(100)).toBe(2);
	});
});
