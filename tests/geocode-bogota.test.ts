import { describe, it, expect } from "vitest";
import {
	approximateBogotaIntersection,
	looksLikeBogotaAddress,
	looksLikeNeighborhood,
	parseIntersection,
} from "../src/lib/geocode/bogota";

describe("Bogotá address heuristics", () => {
	it("detects Calle X con Carrera Y intersections", () => {
		expect(looksLikeBogotaAddress("Calle 76 con Carrera 20, Bogotá")).toBe(
			true,
		);
		expect(looksLikeBogotaAddress("Cl. 100 # 15-20")).toBe(true);
		expect(looksLikeBogotaAddress("Portal Norte")).toBe(false);
		// Station-style names must stay on Croma stop search.
		expect(looksLikeBogotaAddress("Calle 100")).toBe(false);
	});

	it("detects neighborhoods without treating stations as barrios", () => {
		expect(looksLikeNeighborhood("Colina Campestre, Bogotá")).toBe(true);
		expect(looksLikeNeighborhood("Portal Norte")).toBe(false);
		expect(looksLikeNeighborhood("Calle 76 con Carrera 20")).toBe(false);
		expect(looksLikeNeighborhood("Calle 100")).toBe(false);
	});

	it("parses Calle 76 con Carrera 20", () => {
		expect(parseIntersection("Calle 76 con Carrera 20, Bogotá")).toEqual({
			typeA: "Calle",
			numA: "76",
			typeB: "Carrera",
			numB: "20",
		});
	});

	it("approximates Calle 76 × Carrera 20 near 4.666, -74.066", () => {
		const parsed = parseIntersection("Calle 76 con Carrera 20");
		expect(parsed).not.toBeNull();
		const approx = approximateBogotaIntersection(parsed!);
		expect(approx).not.toBeNull();
		expect(approx!.latitude).toBeGreaterThan(4.664);
		expect(approx!.latitude).toBeLessThan(4.668);
		expect(approx!.longitude).toBeGreaterThan(-74.068);
		expect(approx!.longitude).toBeLessThan(-74.064);
	});
});
