export type ToolContentItem = {
	type: string;
	text?: string;
};

export type ToolResultLike = {
	content?: ToolContentItem[];
	isError?: boolean;
	_meta?: unknown;
};

function toolText(result: ToolResultLike): string {
	if (!Array.isArray(result.content)) {
		return "";
	}
	return result.content
		.map((item) => (item.type === "text" ? (item.text ?? "") : ""))
		.join("\n");
}

function normalizeLoose(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase();
}

/**
 * True when a tool result is usable success, not an error payload.
 * Example failure: `{ content: [{ type: "text", text: "Error: Response parse error" }] }`
 * Example failure: `{ isError: true, content: [...] }`
 */
export function isSuccessfulToolResult(result: ToolResultLike): boolean {
	if (result.isError === true) {
		return false;
	}

	const items = result.content;
	if (!Array.isArray(items) || items.length === 0) {
		return false;
	}

	for (const item of items) {
		if (item.type === "text" && typeof item.text === "string") {
			const trimmed = item.text.trimStart();
			if (trimmed.startsWith("Error:")) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Live smoke for plan_route: a known-good pair must yield a route with
 * at least one transit leg. "No route found …" is a failure, not a pass.
 */
export function isSuccessfulPlanRouteResult(result: ToolResultLike): boolean {
	if (!isSuccessfulToolResult(result)) {
		return false;
	}

	const text = toolText(result).trim();
	if (/^No route found\b/i.test(text)) {
		return false;
	}

	return /\bTake\s+[A-Za-z0-9]+/.test(text);
}

/**
 * Portal Norte → Calle 100 smoke: board/alight must look like those stations,
 * not a nonsense loop (same place / absurd duration).
 */
export function isSuccessfulPortalCalle100Result(
	result: ToolResultLike,
): boolean {
	if (!isSuccessfulPlanRouteResult(result)) {
		return false;
	}

	const text = toolText(result);
	const norm = normalizeLoose(text);

	if (/same place/i.test(text)) return false;

	const totalMatch = text.match(/Total time:\s*~?(\d+)\s*minutes/i);
	const total = totalMatch ? parseInt(totalMatch[1], 10) : NaN;
	if (!Number.isFinite(total) || total <= 0 || total >= 60) {
		return false;
	}

	const fromMatch = text.match(/Route from\s+(.+?)\s+to\s+(.+?)(?:\n|$)/i);
	if (fromMatch) {
		const origin = normalizeLoose(fromMatch[1]);
		const dest = normalizeLoose(fromMatch[2]);
		if (origin === dest) return false;
		if (!/portal/.test(origin) || !/norte/.test(origin)) {
			return false;
		}
		if (!/calle\s*100/.test(dest) && !/calle\s*100/.test(norm)) {
			return false;
		}
	}

	// Board/alight text on Take legs must mention Portal…Norte and Calle 100.
	const takeLines = text.split("\n").filter((line) => /\bTake\s+/.test(line));
	if (takeLines.length === 0) return false;
	const takeBlob = normalizeLoose(takeLines.join(" "));
	const hasPortal = /portal/.test(takeBlob) && /norte/.test(takeBlob);
	const hasCalle100 = /calle\s*100/.test(takeBlob);
	return hasPortal && hasCalle100;
}

/**
 * Multimodal smoke: >=2 transit legs with distinct Croma `system` values.
 */
export function isSuccessfulMultimodalPlanRouteResult(
	result: ToolResultLike,
): boolean {
	if (!isSuccessfulPlanRouteResult(result)) {
		return false;
	}

	const text = toolText(result);
	const systems = new Set<string>();
	const re = /\bTake\s+[A-Za-z0-9_-]+\s+\([^)/]+\/([a-z_]+)\)/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		systems.add(match[1]);
	}
	return systems.size >= 2;
}

export function isSuccessfulToolResultFor(
	tool: string,
	result: ToolResultLike,
	options?: { multimodal?: boolean; portalCalle100?: boolean },
): boolean {
	if (tool === "plan_route" || tool === "plan_route_portal_calle100") {
		if (options?.multimodal) {
			return isSuccessfulMultimodalPlanRouteResult(result);
		}
		if (options?.portalCalle100 || tool === "plan_route_portal_calle100") {
			return isSuccessfulPortalCalle100Result(result);
		}
		return isSuccessfulPlanRouteResult(result);
	}
	return isSuccessfulToolResult(result);
}
