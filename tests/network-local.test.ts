import { describe, it, expect } from "vitest";
import { buildNetworkGraph } from "../src/lib/network/build-graph";
import { checkNetworkIntegrity } from "../src/lib/network/integrity";
import { planRouteLocal } from "../src/lib/network/local-planner";
import { NetworkSnapshotSchema } from "../src/lib/network/types";
import mini from "./__fixtures__/network/mini-snapshot.json";

describe("local network snapshot", () => {
	const snapshot = NetworkSnapshotSchema.parse(mini);

	it("builds a graph with walk edges between Calle 100 SITP and TM", () => {
		const graph = buildNetworkGraph(snapshot);
		expect(graph.route_patterns["zonal-466"][0].stop_ids).toEqual([
			"sitp-76",
			"sitp-calle100",
		]);
		expect(graph.station_platforms["55007"]).toContain("56001");
		const hasTransferWalk = graph.walk_edges.some(
			(e) =>
				(e.from === "sitp-calle100" && e.to === "55007") ||
				(e.from === "55007" && e.to === "sitp-calle100") ||
				(e.from === "sitp-calle100" && e.to === "56001") ||
				(e.from === "56001" && e.to === "sitp-calle100"),
		);
		expect(hasTransferWalk).toBe(true);

		const report = checkNetworkIntegrity(snapshot, graph);
		expect(report.ok).toBe(true);
		expect(report.trunk_stations).toBeGreaterThan(0);
		expect(report.trunk_stations_reachable).toBe(report.trunk_stations);
	});

	it("plans multimodal Calle 76 area → Portal Norte on the local graph", async () => {
		const graph = buildNetworkGraph(snapshot);
		const result = await planRouteLocal(
			{ snapshot, graph, fresh: true },
			{
				origin: { latitude: 4.6636, longitude: -74.0603, text: "Calle 76 con Carrera 20" },
				destination: {
					latitude: 4.7616,
					longitude: -74.0463,
					text: "Portal del Norte",
				},
				maxTransfers: 2,
				maxWalkMeters: 1200,
			},
		);

		expect(result.kind).toBe("success");
		if (result.kind !== "success") return;
		const transit = result.plan.segments.filter((s) => s.kind === "transit");
		expect(transit.length).toBeGreaterThanOrEqual(2);
		const systems = new Set(
			transit.map((s) => (s.kind === "transit" ? s.route.system : "")),
		);
		expect(systems.has("zonal_urbano")).toBe(true);
		expect(systems.has("troncal")).toBe(true);
	});
});
