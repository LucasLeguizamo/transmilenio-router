import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "../src/lib/text/html-entities";

describe("decodeHtmlEntities", () => {
	it("decodes Spanish accent entities from TransMilenio alerts", () => {
		expect(decodeHtmlEntities("CICLOV&Iacute;A")).toBe("CICLOVÍA");
		expect(decodeHtmlEntities("Ma&ntilde;ana")).toBe("Mañana");
	});

	it("decodes numeric entities", () => {
		expect(decodeHtmlEntities("&#193;rbol")).toBe("Árbol");
		expect(decodeHtmlEntities("&#xCD;ndice")).toBe("Índice");
	});
});
