import { describe, it, expect } from "vitest";
import {
	isSuccessfulToolResult,
	isSuccessfulPlanRouteResult,
	isSuccessfulMultimodalPlanRouteResult,
	isSuccessfulPortalCalle100Result,
	isSuccessfulToolResultFor,
} from "../src/lib/mcp/result";
import liveNoRoute from "./__fixtures__/mcp-plan-route-no-stations.json";
import multimodalFixture from "./__fixtures__/mcp-plan-route-multimodal.json";

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

describe("isSuccessfulPlanRouteResult", () => {
	it("fails the live no-station shape that previously false-greened", () => {
		expect(isSuccessfulPlanRouteResult(liveNoRoute)).toBe(false);
		expect(isSuccessfulToolResultFor("plan_route", liveNoRoute)).toBe(false);
		// Generic success check alone is not enough for plan_route.
		expect(isSuccessfulToolResult(liveNoRoute)).toBe(true);
	});

	it("requires a transit Take leg", () => {
		expect(
			isSuccessfulPlanRouteResult({
				content: [
					{
						type: "text",
						text:
							"Route from Portal del Norte to Calle 100\nTotal time: ~25 minutes\n\nSteps:\n1. Take B10 (TransMilenio/troncal) from Portal del Norte to Calle 100 (~20 min)",
					},
				],
			}),
		).toBe(true);
	});
});

describe("isSuccessfulPortalCalle100Result", () => {
	it("accepts a plausible Portal → Calle 100 trunk ride", () => {
		const ok = {
			content: [
				{
					type: "text",
					text:
						"Route from Portal del Norte to Calle 100\nTotal time: ~25 minutes\n\nSteps:\n1. Take B10 (TransMilenio/troncal) from Portal del Norte to Calle 100 (~20 min)",
				},
			],
		};
		expect(isSuccessfulPortalCalle100Result(ok)).toBe(true);
		expect(
			isSuccessfulToolResultFor("plan_route", ok, { portalCalle100: true }),
		).toBe(true);
	});

	it("rejects the false-green 21 Ángeles loop", () => {
		expect(
			isSuccessfulPortalCalle100Result({
				content: [
					{
						type: "text",
						text:
							"Route from 21 Ángeles to 21 Ángeles\nTotal time: ~159 minutes\n\nSteps:\n1. Take B10 (TransMilenio/troncal) from 21 Ángeles to 21 Ángeles (~159 min)",
					},
				],
			}),
		).toBe(false);
	});
});

describe("isSuccessfulMultimodalPlanRouteResult", () => {
	it("accepts the recorded Calle 76 → Colina Campestre fixture", () => {
		expect(isSuccessfulMultimodalPlanRouteResult(multimodalFixture)).toBe(
			true,
		);
		expect(
			isSuccessfulToolResultFor("plan_route", multimodalFixture, {
				multimodal: true,
			}),
		).toBe(true);
	});

	it("rejects a single-system plan", () => {
		expect(
			isSuccessfulMultimodalPlanRouteResult({
				content: [
					{
						type: "text",
						text:
							"Steps:\n1. Take B10 (TransMilenio/troncal) from A to B (~20 min)\n2. Take B11 (TransMilenio/troncal) from B to C (~10 min)",
					},
				],
			}),
		).toBe(false);
	});
});

