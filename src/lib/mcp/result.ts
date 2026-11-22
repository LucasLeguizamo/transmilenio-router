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

	// Transit leg text from formatRouteSummary: "Take B10 from …"
	return /\bTake\s+[A-Za-z0-9]+/.test(text);
}

export function isSuccessfulToolResultFor(
	tool: string,
	result: ToolResultLike,
): boolean {
	if (tool === "plan_route") {
		return isSuccessfulPlanRouteResult(result);
	}
	return isSuccessfulToolResult(result);
}
