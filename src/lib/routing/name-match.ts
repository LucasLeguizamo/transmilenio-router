/**
 * Shared stop/station name matching for API and local planners.
 * Avoids ranking every station equally when the query does not match the name.
 */

export function normalizeStopName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

/** Strip articles / wagon suffixes so "Portal del Norte" ≈ "Portal Norte T1". */
export function coreStopName(name: string): string {
	return normalizeStopName(name)
		.replace(/\b(del|de|la|el|los|las)\b/g, " ")
		.replace(/\b[a-z]?\d+\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function namesLooselyMatch(a: string, b: string): boolean {
	const na = normalizeStopName(a);
	const nb = normalizeStopName(b);
	if (!na || !nb) return false;
	if (na === nb || na.includes(nb) || nb.includes(na)) return true;
	const ca = coreStopName(a);
	const cb = coreStopName(b);
	if (!ca || !cb) return false;
	return ca === cb || ca.includes(cb) || cb.includes(ca);
}

/**
 * Score how well a stop name matches a user query.
 * Returns 0 when there is no textual relevance (kind alone must not win).
 */
export function scoreStopNameMatch(
	stop: { name: string; kind?: string; code?: string | null; systems?: string[] },
	query: string,
): number {
	const q = normalizeStopName(query.replace(/,?\s*bogot[aá].*$/i, ""));
	if (!q) return 0;

	const name = normalizeStopName(stop.name);
	const coreQ = coreStopName(q);
	const coreN = coreStopName(stop.name);
	const code = stop.code?.toLowerCase() ?? "";

	let score = 0;
	if (name === q || code === q) score += 200;
	else if (coreN && coreQ && coreN === coreQ) score += 180;
	else if (name.startsWith(q) || q.startsWith(name)) score += 120;
	else if (coreN && coreQ && (coreN.startsWith(coreQ) || coreQ.startsWith(coreN)))
		score += 110;
	else if (name.includes(q) || (coreN && coreQ && coreN.includes(coreQ))) score += 70;
	else if (q.includes(name) && name.length >= 6) score += 40;
	else return 0;

	if (stop.kind === "station") score += 40;
	if (stop.systems?.includes("troncal") || stop.kind === "station") {
		// Prefer trunk stations for corridor names like Calle 100 / Portal Norte.
		if (/\b(portal|calle|avenida|heroes|héroes)\b/i.test(q)) score += 25;
	}
	if (code && (code === q || code.includes(q))) score += 20;

	return score;
}
