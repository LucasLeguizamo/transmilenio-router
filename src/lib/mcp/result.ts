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
 *
 * Example failure from live:
 * `No route found: No TransMilenio stations within 800m of destination`
 */
export function isSuccessfulPlanRouteResult(result: ToolResultLike): boolean {
	if (!isSuccessfulToolResult(result)) {
		return false;
	}

	const text = toolText(result).trim();
	if (/^No route found\b/i.test(text)) {
		return false;
	}

	// Transit leg text from formatRouteSummary: "Take B10 (TransMilenio/troncal) from …"
	return /\bTake\s+[A-Za-z0-9]+/.test(text);
}

/**
 * Multimodal smoke: >=2 transit legs with distinct Croma `system` values.
 * Example success fragment:
 * `Take 466 (SITP Urbano/zonal_urbano) from …`
 * `Take B907 (TransMilenio/troncal) from …`
 */
export function isSuccessfulMultimodalPlanRouteResult(
	result: ToolResultLike,
): boolean {
	if (!isSuccessfulPlanRouteResult(result)) {
		return false;
	}

	const text = toolText(result);
	const systems = new Set<string>();
	const re =
		/\bTake\s+[A-Za-z0-9_-]+\s+\([^)/]+\/([a-z_]+)\)/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		systems.add(match[1]);
	}
	return systems.size >= 2;
}

export function isSuccessfulToolResultFor(
	tool: string,
	result: ToolResultLike,
	options?: { multimodal?: boolean },
): boolean {
	if (tool === "plan_route") {
		if (options?.multimodal) {
			return isSuccessfulMultimodalPlanRouteResult(result);
		}
		return isSuccessfulPlanRouteResult(result);
	}
	return isSuccessfulToolResult(result);
}
