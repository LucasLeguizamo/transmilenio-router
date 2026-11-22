export type ToolContentItem = {
	type: string;
	text?: string;
};

export type ToolResultLike = {
	content?: ToolContentItem[];
	isError?: boolean;
	_meta?: unknown;
};

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
