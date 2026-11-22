import { describe, it, expect } from "vitest";
import { scoreStopNameMatch } from "../src/lib/routing/name-match";

describe("scoreStopNameMatch", () => {
	it("prefers Portal del Norte over unrelated stations for Portal Norte", () => {
		const portal = scoreStopNameMatch(
			{ name: "Portal del Norte", kind: "station", systems: ["troncal"] },
			"Portal Norte",
		);
		const angeles = scoreStopNameMatch(
			{ name: "21 Ángeles", kind: "station", systems: ["troncal"] },
			"Portal Norte",
		);
		expect(portal).toBeGreaterThan(150);
		expect(angeles).toBe(0);
		expect(portal).toBeGreaterThan(angeles);
	});

	it("prefers Calle 100 trunk station over unrelated names", () => {
		const calle100 = scoreStopNameMatch(
			{ name: "Calle 100", kind: "station", systems: ["troncal"] },
			"Calle 100",
		);
		const angeles = scoreStopNameMatch(
			{ name: "21 Ángeles", kind: "station", systems: ["troncal"] },
			"Calle 100",
		);
		expect(calle100).toBeGreaterThan(150);
		expect(angeles).toBe(0);
	});
});
