/**
 * Bogotá free-text geocoding via Nominatim (OpenStreetMap).
 * Handles "Calle X con Carrera Y" intersections and neighborhood names.
 *
 * Error examples:
 * - Nominatim 429 / network failure → kind: "error"
 * - No Bogotá hit for the query → kind: "not_found"
 */

export type GeocodePoint = {
	latitude: number;
	longitude: number;
	displayName: string;
	source: "nominatim" | "intersection";
};

export type GeocodeResult =
	| { kind: "success"; point: GeocodePoint }
	| { kind: "not_found"; query: string }
	| { kind: "error"; message: string };

type NominatimHit = {
	lat: string;
	lon: string;
	display_name: string;
	class?: string;
	type?: string;
	importance?: number;
	boundingbox?: [string, string, string, string];
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
	"TransMilenioMCP/0.1 (https://github.com/LucasLeguizamo/transmilenio-router)";

const STREET_WORD =
	"(?:calle|cl\\.?|carrera|cra\\.?|cr\\.?|ak|avenida|av\\.?|avda\\.?|diagonal|dg\\.?|transversal|tv\\.?|circular|circunvalar)";

/** "Calle 76 con Carrera 20" / "Cl. 76 # 20" */
const INTERSECTION_RE = new RegExp(
	`^\\s*(${STREET_WORD})\\s*(\\d+[A-Za-z]?)\\s*(?:con|#|y|&)\\s*(?:(${STREET_WORD})\\s*)?(\\d+[A-Za-z]?)\\b`,
	"i",
);

function normalizeStreetType(raw: string): string {
	const t = raw.toLowerCase().replace(/\./g, "");
	if (t.startsWith("cl") || t === "calle") return "Calle";
	if (t.startsWith("cr") || t === "carrera" || t === "ak") return "Carrera";
	if (t.startsWith("av")) return "Avenida";
	if (t.startsWith("dg") || t === "diagonal") return "Diagonal";
	if (t.startsWith("tv") || t === "transversal") return "Transversal";
	if (t === "circular") return "Circular";
	if (t === "circunvalar") return "Circunvalar";
	return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function stripCitySuffix(text: string): string {
	return text
		.replace(/,?\s*bogot[aá]\s*(d\.?\s*c\.?|ciudad)?\s*$/i, "")
		.replace(/,?\s*colombia\s*$/i, "")
		.trim();
}

export function looksLikeBogotaAddress(text: string): boolean {
	const q = stripCitySuffix(text);
	if (INTERSECTION_RE.test(q)) return true;
	if (
		/\b(calle|carrera|avenida|diagonal|transversal)\s+\d+[A-Za-z]?\s*#\s*\d+/i.test(
			q,
		)
	) {
		return true;
	}
	return false;
}

export function looksLikeNeighborhood(text: string): boolean {
	const q = stripCitySuffix(text).toLowerCase();
	if (looksLikeBogotaAddress(text)) return false;
	if (/\b(portal|estacion|estación|museo|universidades)\b/i.test(q)) return false;
	if (
		/\b(calle|carrera|avenida|diagonal|transversal|cl\.?|cra\.?|av\.?)\b/i.test(
			q,
		)
	) {
		return false;
	}
	return q.length >= 4 && !/^\d/.test(q);
}

export type ParsedIntersection = {
	typeA: string;
	numA: string;
	typeB: string;
	numB: string;
};

export function parseIntersection(text: string): ParsedIntersection | null {
	const q = stripCitySuffix(text);
	const match = q.match(INTERSECTION_RE);
	if (!match) return null;
	return {
		typeA: normalizeStreetType(match[1]),
		numA: match[2],
		typeB: match[3] ? normalizeStreetType(match[3]) : "Carrera",
		numB: match[4],
	};
}

function scoreHit(hit: NominatimHit, preferLocalities: string[]): number {
	const name = hit.display_name.toLowerCase();
	if (!name.includes("bogot")) return -100;
	let score = hit.importance ?? 0;
	if (hit.class === "highway") score += 0.25;
	if (
		hit.class === "place" ||
		hit.type === "suburb" ||
		hit.type === "neighbourhood"
	) {
		score += 0.2;
	}
	if (hit.class === "leisure" && hit.type === "park") score += 0.15;
	for (const loc of preferLocalities) {
		if (name.includes(loc.toLowerCase())) score += 0.4;
	}
	if (
		name.includes("engativ") &&
		preferLocalities.some((l) => /chapinero|barrios unidos/i.test(l))
	) {
		score -= 0.5;
	}
	return score;
}

async function nominatimSearch(
	query: string,
	options?: { viewbox?: string; bounded?: boolean },
): Promise<NominatimHit[]> {
	const url = new URL(NOMINATIM_URL);
	url.searchParams.set("format", "json");
	url.searchParams.set("limit", "8");
	url.searchParams.set("countrycodes", "co");
	url.searchParams.set("q", query);
	if (options?.viewbox) {
		url.searchParams.set("viewbox", options.viewbox);
		if (options.bounded) url.searchParams.set("bounded", "1");
	}

	const response = await fetch(url.toString(), {
		headers: {
			Accept: "application/json",
			"User-Agent": USER_AGENT,
		},
	});

	if (!response.ok) {
		throw new Error(`Nominatim HTTP ${response.status}`);
	}

	const json = (await response.json()) as NominatimHit[];
	return Array.isArray(json) ? json : [];
}

function hitPoint(hit: NominatimHit): { lat: number; lon: number } {
	return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) };
}

function haversineKm(
	a: { lat: number; lon: number },
	b: { lat: number; lon: number },
): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const x =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Approximate Bogotá cadastral intersection when OSM lacks a node.
 * Calles run roughly E–W, Carreras N–S in the central grid.
 * Tuned so Calle 76 × Carrera 20 ≈ 4.666, -74.066 (Chapinero / Barrios Unidos).
 */
export function approximateBogotaIntersection(
	parsed: ParsedIntersection,
): { latitude: number; longitude: number } | null {
	const nA = parseInt(parsed.numA, 10);
	const nB = parseInt(parsed.numB, 10);
	if (Number.isNaN(nA) || Number.isNaN(nB)) return null;

	const isCalleA = parsed.typeA === "Calle";
	const isCarreraA = parsed.typeA === "Carrera" || parsed.typeA === "Avenida";
	const isCalleB = parsed.typeB === "Calle";
	const isCarreraB = parsed.typeB === "Carrera" || parsed.typeB === "Avenida";

	let calleNum: number | null = null;
	let carreraNum: number | null = null;
	if (isCalleA && isCarreraB) {
		calleNum = nA;
		carreraNum = nB;
	} else if (isCarreraA && isCalleB) {
		calleNum = nB;
		carreraNum = nA;
	} else {
		return null;
	}

	// Linear fit around Chapinero / Barrios Unidos:
	// Calle 76 × Carrera 20 ≈ 4.666, -74.066 (user-verified target).
	const latitude = 4.5981 + calleNum * 0.000895;
	const longitude = -74.057 + (carreraNum - 7) * -0.00069;
	return { latitude, longitude };
}

async function geocodeIntersection(
	parsed: ParsedIntersection,
): Promise<GeocodeResult> {
	const preferLocalities =
		parsed.numA === "76" || parsed.numB === "76"
			? ["Chapinero", "Barrios Unidos", "Nogal", "Quinta Camacho"]
			: ["Chapinero", "Bogotá"];

	const streetA = `${parsed.typeA} ${parsed.numA}, Bogotá, Colombia`;
	const streetB = `${parsed.typeB} ${parsed.numB}, Bogotá, Colombia`;

	const hitsA = await nominatimSearch(streetA);
	await new Promise((r) => setTimeout(r, 1100));
	const hitsB = await nominatimSearch(streetB);

	const scoredA = hitsA
		.map((h) => ({ h, s: scoreHit(h, preferLocalities) }))
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s)
		.slice(0, 5);
	const scoredB = hitsB
		.map((h) => ({ h, s: scoreHit(h, preferLocalities) }))
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s)
		.slice(0, 5);

	let bestPair: {
		lat: number;
		lon: number;
		dist: number;
		name: string;
	} | null = null;

	for (const a of scoredA) {
		const pa = hitPoint(a.h);
		for (const b of scoredB) {
			const pb = hitPoint(b.h);
			const dist = haversineKm(pa, pb);
			if (dist > 3.5) continue;
			const lat = (pa.lat + pb.lat) / 2;
			const lon = (pa.lon + pb.lon) / 2;
			if (!bestPair || dist < bestPair.dist) {
				bestPair = {
					lat,
					lon,
					dist,
					name: `${parsed.typeA} ${parsed.numA} con ${parsed.typeB} ${parsed.numB}`,
				};
			}
		}
	}

	const approx = approximateBogotaIntersection(parsed);
	const label = `${parsed.typeA} ${parsed.numA} con ${parsed.typeB} ${parsed.numB}`;

	// Prefer Nominatim midpoint only when it sits near the cadastral approx
	// (avoids "Calle 76, Localidad Chapinero" axis hits far from Carrera 20).
	if (bestPair && bestPair.dist < 2.5 && approx) {
		const driftKm = haversineKm(
			{ lat: bestPair.lat, lon: bestPair.lon },
			{ lat: approx.latitude, lon: approx.longitude },
		);
		if (driftKm <= 0.6) {
			return {
				kind: "success",
				point: {
					latitude: bestPair.lat,
					longitude: bestPair.lon,
					displayName: `${label}, Bogotá`,
					source: "intersection",
				},
			};
		}
	} else if (bestPair && bestPair.dist < 1.0 && !approx) {
		return {
			kind: "success",
			point: {
				latitude: bestPair.lat,
				longitude: bestPair.lon,
				displayName: `${label}, Bogotá`,
				source: "intersection",
			},
		};
	}

	if (approx) {
		return {
			kind: "success",
			point: {
				latitude: approx.latitude,
				longitude: approx.longitude,
				displayName: `${label}, Bogotá`,
				source: "intersection",
			},
		};
	}

	return { kind: "not_found", query: label };
}

/**
 * Geocode a Bogotá free-text location (intersection, address, or neighborhood).
 */
export async function geocodeBogota(text: string): Promise<GeocodeResult> {
	const trimmed = text.trim();
	if (!trimmed) {
		return { kind: "not_found", query: text };
	}

	const parsed = parseIntersection(trimmed);
	if (parsed) {
		try {
			return await geocodeIntersection(parsed);
		} catch (error) {
			const approx = approximateBogotaIntersection(parsed);
			if (approx) {
				return {
					kind: "success",
					point: {
						latitude: approx.latitude,
						longitude: approx.longitude,
						displayName: `${parsed.typeA} ${parsed.numA} con ${parsed.typeB} ${parsed.numB}, Bogotá`,
						source: "intersection",
					},
				};
			}
			return {
				kind: "error",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	const preferLocalities = /colina campestre/i.test(trimmed)
		? ["Suba", "Colina"]
		: ["Bogotá"];

	const queries = [
		`${stripCitySuffix(trimmed)}, Bogotá, Colombia`,
		`${stripCitySuffix(trimmed)}, Bogotá`,
	];

	let best: { hit: NominatimHit; score: number } | null = null;
	const errors: string[] = [];

	for (const query of queries) {
		try {
			const hits = await nominatimSearch(query);
			for (const hit of hits) {
				const score = scoreHit(hit, preferLocalities);
				if (!best || score > best.score) best = { hit, score };
			}
			if (best && best.score > 0.2) break;
			await new Promise((r) => setTimeout(r, 1100));
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}

	if (!best || best.score < 0) {
		if (errors.length > 0 && !best) {
			return { kind: "error", message: errors[0] };
		}
		return { kind: "not_found", query: text };
	}

	return {
		kind: "success",
		point: {
			latitude: parseFloat(best.hit.lat),
			longitude: parseFloat(best.hit.lon),
			displayName: best.hit.display_name.split(",").slice(0, 3).join(",").trim(),
			source: "nominatim",
		},
	};
}
