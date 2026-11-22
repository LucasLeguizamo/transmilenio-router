const NAMED_ENTITIES: Record<string, string> = {
	nbsp: " ",
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	Aacute: "Á",
	aacute: "á",
	Eacute: "É",
	eacute: "é",
	Iacute: "Í",
	iacute: "í",
	Oacute: "Ó",
	oacute: "ó",
	Uacute: "Ú",
	uacute: "ú",
	Ntilde: "Ñ",
	ntilde: "ñ",
	Uuml: "Ü",
	uuml: "ü",
	Agrave: "À",
	agrave: "à",
	Egrave: "È",
	egrave: "è",
	Igrave: "Ì",
	igrave: "ì",
	Ograve: "Ò",
	ograve: "ò",
	Ugrave: "Ù",
	ugrave: "ù",
	Acirc: "Â",
	acirc: "â",
	Ecirc: "Ê",
	ecirc: "ê",
	Icirc: "Î",
	icirc: "î",
	Ocirc: "Ô",
	ocirc: "ô",
	Ucirc: "Û",
	ucirc: "û",
	copy: "©",
	reg: "®",
	deg: "°",
	ndash: "–",
	mdash: "—",
	lsquo: "‘",
	rsquo: "’",
	ldquo: "“",
	rdquo: "”",
};

/**
 * Decode common HTML entities found in TransMilenio alert text
 * (e.g. `CICLOV&Iacute;A` → `CICLOVÍA`).
 */
export function decodeHtmlEntities(input: string): string {
	return input
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
			const code = Number.parseInt(hex, 16);
			return Number.isFinite(code) ? String.fromCodePoint(code) : _;
		})
		.replace(/&#(\d+);/g, (_, dec: string) => {
			const code = Number.parseInt(dec, 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : _;
		})
		.replace(/&([A-Za-z]+);/g, (match, name: string) => {
			return NAMED_ENTITIES[name] ?? match;
		});
}
