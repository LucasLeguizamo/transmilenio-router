import { haversineDistance } from "../geo/haversine";
import { scoreStopNameMatch } from "../routing/name-match";
import type { LoadedNetwork } from "./store";
import type { NetworkStop } from "./types";

export type LocalStopQuery = {
	query?: string;
	latitude?: number;
	longitude?: number;
	radiusMeters?: number;
	route?: string;
	limit?: number;
};

/**
 * Search the local snapshot for stops (0 Croma calls).
 */
export function findStopsLocal(
	network: LoadedNetwork,
	input: LocalStopQuery,
): NetworkStop[] {
	const limit = input.limit ?? 10;
	let candidates = network.snapshot.stops;

	if (input.route) {
		const code = input.route.toUpperCase();
		candidates = candidates.filter(
			(s) =>
				s.route_codes.some((c) => c.toUpperCase() === code) ||
				s.route_ids.includes(input.route!),
		);
	}

	if (input.latitude != null && input.longitude != null) {
		const radius = input.radiusMeters ?? 500;
		return candidates
			.map((stop) => ({
				stop,
				d: haversineDistance(
					input.latitude!,
					input.longitude!,
					stop.lat,
					stop.lon,
				),
			}))
			.filter((x) => x.d <= radius)
			.sort((a, b) => a.d - b.d)
			.slice(0, limit)
			.map((x) => x.stop);
	}

	if (input.query) {
		return candidates
			.map((stop) => ({
				stop,
				score: scoreStopNameMatch(
					{
						name: stop.name,
						kind: stop.kind,
						code: stop.code,
						systems: stop.systems,
					},
					input.query!,
				),
			}))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((x) => x.stop);
	}

	return candidates.slice(0, limit);
}
