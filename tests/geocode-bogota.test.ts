import { describe, it, expect } from "vitest";
import {
	looksLikeBogotaAddress,
	looksLikeNeighborhood,
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
});
