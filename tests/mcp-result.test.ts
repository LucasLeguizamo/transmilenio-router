import { describe, it, expect } from "vitest";
import { isSuccessfulToolResult } from "../src/lib/mcp/result";

describe("isSuccessfulToolResult", () => {
	it("passes a normal tool success payload", () => {
		expect(
			isSuccessfulToolResult({
				content: [{ type: "text", text: "Found 3 stop(s):\n\n• Portal Norte" }],
			}),
		).toBe(true);
	});

	it("fails when text starts with Error:", () => {
		expect(
			isSuccessfulToolResult({
				content: [
					{
						type: "text",
						text: "Error: Response parse error: Expected number, received null",
					},
				],
			}),
		).toBe(false);
	});

	it("fails when isError is true", () => {
		expect(
			isSuccessfulToolResult({
				isError: true,
				content: [{ type: "text", text: "something went wrong" }],
			}),
		).toBe(false);
	});

	it("fails on empty content", () => {
		expect(isSuccessfulToolResult({ content: [] })).toBe(false);
		expect(isSuccessfulToolResult({})).toBe(false);
	});
});
