import type { NetworkGraph, NetworkSnapshot } from "./types";

export type IntegrityIssue = {
	code: string;
	message: string;
};

export type IntegrityReport = {
	ok: boolean;
	counts: NetworkSnapshot["counts"];
	walk_edges: number;
	issues: IntegrityIssue[];
	trunk_stations: number;
	trunk_stations_reachable: number;
};

/**
 * Validate snapshot/graph consistency and trunk-station connectivity via walk+route edges.
 */
export function checkNetworkIntegrity(
	snapshot: NetworkSnapshot,
	graph: NetworkGraph,
): IntegrityReport {
	const issues: IntegrityIssue[] = [];
	const stopIds = new Set(snapshot.stops.map((s) => s.id));
	const routeIds = new Set(snapshot.routes.map((r) => r.id));

	if (snapshot.counts.stops !== snapshot.stops.length) {
		issues.push({
			code: "count_mismatch_stops",
			message: `counts.stops=${snapshot.counts.stops} but stops.length=${snapshot.stops.length}`,
		});
	}
	if (snapshot.counts.routes !== snapshot.routes.length) {
		issues.push({
			code: "count_mismatch_routes",
			message: `counts.routes=${snapshot.counts.routes} but routes.length=${snapshot.routes.length}`,
		});
	}

	for (const route of snapshot.routes) {
		if (!graph.route_patterns[route.id]) {
			issues.push({
				code: "missing_route_patterns",
				message: `route ${route.id} missing from graph.route_patterns`,
			});
		}
		for (const pattern of route.patterns) {
			for (const ps of pattern.stops) {
				if (!stopIds.has(ps.id)) {
					issues.push({
						code: "dangling_pattern_stop",
						message: `route ${route.id} pattern references unknown stop ${ps.id}`,
					});
				}
			}
		}
	}

	for (const [stopId, routes] of Object.entries(graph.stop_to_routes)) {
		if (!stopIds.has(stopId)) {
			issues.push({
				code: "dangling_stop_to_routes",
				message: `graph stop_to_routes key ${stopId} not in snapshot`,
			});
		}
		for (const routeId of routes) {
			if (!routeIds.has(routeId)) {
				issues.push({
					code: "dangling_stop_route_id",
					message: `stop ${stopId} lists unknown route ${routeId}`,
				});
			}
		}
	}

	for (const edge of graph.walk_edges) {
		if (!stopIds.has(edge.from) || !stopIds.has(edge.to)) {
			issues.push({
				code: "dangling_walk_edge",
				message: `walk edge ${edge.from}→${edge.to} has unknown stop`,
			});
		}
	}

	const trunkStations = snapshot.stops.filter(
		(s) => s.kind === "station" && s.systems.includes("troncal"),
	);
	const adjacency = new Map<string, Set<string>>();
	const addAdj = (a: string, b: string) => {
		const setA = adjacency.get(a) ?? new Set<string>();
		setA.add(b);
		adjacency.set(a, setA);
		const setB = adjacency.get(b) ?? new Set<string>();
		setB.add(a);
		adjacency.set(b, setB);
	};
	for (const edge of graph.walk_edges) {
		addAdj(edge.from, edge.to);
	}
	for (const [routeId, patterns] of Object.entries(graph.route_patterns)) {
		void routeId;
		for (const pattern of patterns) {
			for (let i = 0; i < pattern.stop_ids.length - 1; i++) {
				addAdj(pattern.stop_ids[i], pattern.stop_ids[i + 1]);
			}
		}
	}

	let reachable = 0;
	if (trunkStations.length > 0) {
		const start = trunkStations[0].id;
		const seen = new Set<string>([start]);
		const queue = [start];
		while (queue.length > 0) {
			const cur = queue.shift()!;
			for (const next of adjacency.get(cur) ?? []) {
				if (seen.has(next)) continue;
				seen.add(next);
				queue.push(next);
			}
		}
		reachable = trunkStations.filter((s) => seen.has(s.id)).length;
		if (reachable < trunkStations.length) {
			issues.push({
				code: "trunk_not_fully_connected",
				message: `${reachable}/${trunkStations.length} trunk stations reachable from ${start}`,
			});
		}
	}

	return {
		ok: issues.length === 0,
		counts: snapshot.counts,
		walk_edges: graph.walk_edges.length,
		issues,
		trunk_stations: trunkStations.length,
		trunk_stations_reachable: reachable,
	};
}
