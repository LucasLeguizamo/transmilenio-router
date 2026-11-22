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
	source: "nominatim";
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
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TransMilenioMCP/0.1 (https://github.com/LucasLeguizamo/transmilenio-router)";

const STREET_WORD =
	"(?:calle|cl\\.?|carrera|cra\\.?|cr\\.?|ak|avenida|av\\.?|avda\\.?|diagonal|dg\\.?|transversal|tv\\.?|circular|circunvalar)";

/** "Calle 76 con Carrera 20" / "Cl. 76 # 20" / "Calle 100 con Autopista Norte" */
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
	// Intersections / cadastral ("Calle 76 con Carrera 20", "Calle 100 # 15")
	if (INTERSECTION_RE.test(q)) return true;
	if (
		/\b(calle|carrera|avenida|diagonal|transversal)\s+\d+[A-Za-z]?\s*#\s*\d+/i.test(
			q,
		)
	) {
		return true;
	}
	// Plain "Calle 100" is often a TransMilenio station name — leave to Croma.
	return false;
}

export function looksLikeNeighborhood(text: string): boolean {
	const q = stripCitySuffix(text).toLowerCase();
	if (looksLikeBogotaAddress(text)) return false;
	// Station / street-axis names should stay on Croma stop search.
	if (/\b(portal|estacion|estación|museo|universidades)\b/i.test(q)) return false;
	if (
		/\b(calle|carrera|avenida|diagonal|transversal|cl\.?|cra\.?|av\.?)\b/i.test(
			q,
		)
	) {
		return false;
	}
	// Place names / barrios (e.g. "Colina Campestre")
	return q.length >= 4 && !/^\d/.test(q);
}

function buildIntersectionQueries(text: string): string[] {
	const q = stripCitySuffix(text);
	const match = q.match(INTERSECTION_RE);
	const queries: string[] = [];

	if (match) {
		const typeA = normalizeStreetType(match[1]);
		const numA = match[2];
		const typeB = match[3] ? normalizeStreetType(match[3]) : "Carrera";
		const numB = match[4];
		// Bogotá cadastral style: Calle X # Y ≈ Calle X at Carrera Y
		queries.push(`${typeA} ${numA} # ${numB}, Bogotá, Colombia`);
		queries.push(`${typeA} ${numA} con ${typeB} ${numB}, Bogotá, Colombia`);
		queries.push(`${typeA} ${numA} ${typeB} ${numB}, Chapinero, Bogotá, Colombia`);
		queries.push(`${typeA} ${numA}, Bogotá, Colombia`);
		return queries;
	}

	queries.push(`${q}, Bogotá, Colombia`);
	queries.push(`${q}, Bogotá`);
	return queries;
}

function scoreHit(hit: NominatimHit, preferLocalities: string[]): number {
	const name = hit.display_name.toLowerCase();
	if (!name.includes("bogot")) return -100;
	let score = hit.importance ?? 0;
	if (hit.class === "highway") score += 0.2;
	if (hit.class === "place" || hit.type === "suburb" || hit.type === "neighbourhood") {
		score += 0.25;
	}
	if (hit.class === "leisure" && hit.type === "park") score += 0.15;
	for (const loc of preferLocalities) {
		if (name.includes(loc.toLowerCase())) score += 0.35;
	}
	// Penalize far-west Engativá false positives for east-side calles when Chapinero expected
	if (name.includes("engativ") && preferLocalities.some((l) => /chapinero|barrios unidos/i.test(l))) {
		score -= 0.4;
	}
	return score;
}

async function nominatimSearch(query: string): Promise<NominatimHit[]> {
	const url = new URL(NOMINATIM_URL);
	url.searchParams.set("format", "json");
	url.searchParams.set("limit", "5");
	url.searchParams.set("countrycodes", "co");
	url.searchParams.set("q", query);

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

/**
 * Geocode a Bogotá free-text location (intersection, address, or neighborhood).
 */
export async function geocodeBogota(text: string): Promise<GeocodeResult> {
	const trimmed = text.trim();
	if (!trimmed) {
		return { kind: "not_found", query: text };
	}

	const queries = buildIntersectionQueries(trimmed);
	const preferLocalities = /colina campestre/i.test(trimmed)
		? ["Suba", "Colina"]
		: /calle\s*76/i.test(trimmed)
			? ["Chapinero", "Barrios Unidos", "Nogal"]
			: ["Bogotá"];

	let best: { hit: NominatimHit; score: number } | null = null;
	const errors: string[] = [];

	for (const query of queries) {
		try {
			const hits = await nominatimSearch(query);
			for (const hit of hits) {
				const score = scoreHit(hit, preferLocalities);
				if (!best || score > best.score) {
					best = { hit, score };
				}
			}
			if (best && best.score > 0.2) break;
			// Nominatim usage policy: max 1 req/s
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
