#!/usr/bin/env tsx
/**
 * TransMilenio MCP Verification CLI
 *
 * A verification tool for the TransMilenio MCP server.
 * Composable subcommands with JSON output, descriptive errors, and --dry-run support.
 *
 * Usage:
 *   pnpm verify doctor          Health check
 *   pnpm verify mcp             Test MCP tools
 *   pnpm verify ui              Render and screenshot UI
 *   pnpm verify all             Run all verifications
 *   pnpm verify --help          Show help
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { chromium, Browser } from "playwright";
import {
	isSuccessfulToolResultFor,
	isSuccessfulMultimodalPlanRouteResult,
	type ToolResultLike,
} from "../src/lib/mcp/result";

const ARTIFACTS_DIR = join(process.cwd(), "artifacts");
const FIXTURES_DIR = join(process.cwd(), "tests", "__fixtures__");

interface VerifyResult {
	success: boolean;
	command: string;
	duration_ms: number;
	output?: unknown;
	error?: string;
}

interface DoctorCheck {
	name: string;
	status: "pass" | "fail" | "warn";
	message: string;
}

function parseArgs(args: string[]): {
	command: string;
	flags: Record<string, boolean | string>;
} {
	const flags: Record<string, boolean | string> = {};
	let command = "help";

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const nextArg = args[i + 1];
			if (nextArg && !nextArg.startsWith("--")) {
				flags[key] = nextArg;
				i++;
			} else {
				flags[key] = true;
			}
		} else if (!arg.startsWith("-")) {
			command = arg;
		}
	}

	return { command, flags };
}

function printHelp(): void {
	console.log(`
TransMilenio MCP Verification CLI

USAGE:
  pnpm verify <command> [options]

COMMANDS:
  doctor       Run health checks (env vars, dependencies, build)
  mcp          Test MCP server tools with fixture data
  ui           Render UI components and capture screenshots
  network      Validate local network snapshot + plan_route perf (local vs API)
  all          Run all verification steps
  help         Show this help message

OPTIONS:
  --json       Output results as JSON
  --dry-run    Show what would be done without executing
  --live       Use live Croma API instead of fixtures (requires CROMA_API_KEY)
  --verbose    For mcp/plan_route: dump candidate stops, shared codes, and match outcomes
  --port NUM   Port for dev server (default: 3457)

EXAMPLES:
  pnpm verify doctor --json
  pnpm verify mcp --live
  pnpm verify mcp --live --verbose
  pnpm verify network
  pnpm verify network --live
  pnpm verify ui
  pnpm verify all --dry-run

EXIT CODES:
  0  All checks passed
  1  One or more checks failed
  2  Invalid arguments or configuration error
`);
}

async function runDoctor(
	flags: Record<string, boolean | string>,
): Promise<VerifyResult> {
	const start = Date.now();
	const checks: DoctorCheck[] = [];

	checks.push({
		name: "node_version",
		status: process.version.startsWith("v20") || process.version.startsWith("v22") ? "pass" : "warn",
		message: `Node.js ${process.version}`,
	});

	const hasPackageJson = existsSync(join(process.cwd(), "package.json"));
	checks.push({
		name: "package_json",
		status: hasPackageJson ? "pass" : "fail",
		message: hasPackageJson ? "package.json exists" : "package.json not found",
	});

	const hasNodeModules = existsSync(join(process.cwd(), "node_modules"));
	checks.push({
		name: "dependencies",
		status: hasNodeModules ? "pass" : "fail",
		message: hasNodeModules ? "Dependencies installed" : "Run pnpm install",
	});

	const hasCromaKey = !!process.env.CROMA_API_KEY;
	checks.push({
		name: "croma_api_key",
		status: hasCromaKey ? "pass" : "warn",
		message: hasCromaKey
			? "CROMA_API_KEY is set"
			: "CROMA_API_KEY not set (required for live API calls)",
	});

	const hasEnvExample = existsSync(join(process.cwd(), ".env.example"));
	checks.push({
		name: "env_example",
		status: hasEnvExample ? "pass" : "fail",
		message: hasEnvExample ? ".env.example exists" : ".env.example not found",
	});

	const hasTsConfig = existsSync(join(process.cwd(), "tsconfig.json"));
	checks.push({
		name: "tsconfig",
		status: hasTsConfig ? "pass" : "fail",
		message: hasTsConfig ? "tsconfig.json exists" : "tsconfig.json not found",
	});

	const hasFixtures = existsSync(FIXTURES_DIR);
	checks.push({
		name: "fixtures",
		status: hasFixtures ? "pass" : "warn",
		message: hasFixtures
			? "Test fixtures directory exists"
			: "No fixtures directory (tests may need live API)",
	});

	const failed = checks.filter((c) => c.status === "fail");
	const success = failed.length === 0;

	if (flags.json) {
		console.log(JSON.stringify({ checks, success }, null, 2));
	} else {
		console.log("\n📋 Doctor Checks\n");
		for (const check of checks) {
			const icon =
				check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
			console.log(`${icon} ${check.name}: ${check.message}`);
		}
		console.log(
			`\n${success ? "✅ All critical checks passed" : "❌ Some checks failed"}`,
		);
	}

	return {
		success,
		command: "doctor",
		duration_ms: Date.now() - start,
		output: { checks },
	};
}

async function freePort(port: number): Promise<void> {
	await new Promise<void>((resolve) => {
		const killer = spawn("bash", [
			"-c",
			`pkill -f "next dev --port ${port}" 2>/dev/null || true; fuser -k ${port}/tcp 2>/dev/null || true`,
		]);
		killer.on("close", () => setTimeout(resolve, 1000));
	});
}

async function startDevServer(port: number): Promise<ChildProcess> {
	await freePort(port);

	return new Promise((resolve, reject) => {
		const child = spawn("pnpm", ["dev", "--port", String(port)], {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, PORT: String(port) },
		});

		let started = false;
		const timeout = setTimeout(() => {
			if (!started) {
				child.kill();
				reject(new Error("Dev server failed to start within 30s"));
			}
		}, 30000);

		child.stdout?.on("data", (data) => {
			const output = data.toString();
			if (output.includes("Ready") || output.includes("started server")) {
				started = true;
				clearTimeout(timeout);
				setTimeout(() => resolve(child), 1000);
			}
		});

		child.stderr?.on("data", (data) => {
			if (!started) {
				console.error("Dev server error:", data.toString());
			}
		});

		child.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
}

async function runMCPTests(
	flags: Record<string, boolean | string>,
): Promise<VerifyResult> {
	const start = Date.now();
	const useLive = flags.live === true;
	const verbose = flags.verbose === true;
	const results: Array<{ tool: string; success: boolean; output: unknown }> = [];

	if (flags["dry-run"]) {
		console.log("Would test MCP tools:", [
			"find_stops",
			"stop_arrivals",
			"service_alerts",
			"plan_route",
		]);
		return {
			success: true,
			command: "mcp",
			duration_ms: Date.now() - start,
			output: { dry_run: true },
		};
	}

	if (!useLive) {
		const fixtureFile = join(FIXTURES_DIR, "mcp-responses.json");
		if (!existsSync(fixtureFile)) {
			mkdirSync(FIXTURES_DIR, { recursive: true });
			writeFileSync(
				fixtureFile,
				JSON.stringify(
					{
						find_stops: {
							content: [
								{
									type: "text",
									text: 'Found 3 stop(s):\n\n• Portal Norte\n  ID: 10001 | Routes: B10, B12, K86\n• Calle 127\n  ID: 10002 | Routes: B10, B73\n• Calle 100\n  ID: 10003 | Routes: B10, K86, J24',
								},
							],
							_meta: {
								ui: "ui://transmilenio-mcp/stops-map?data=%7B%22type%22%3A%22stops-map%22%7D",
							},
						},
						stop_arrivals: {
							content: [
								{
									type: "text",
									text: "Arrivals at Portal Norte\n(Live data)\n\n• B10: 3 min\n• K86: 7 min\n• B12: 12 min",
								},
							],
							_meta: {
								ui: "ui://transmilenio-mcp/arrivals?data=%7B%22type%22%3A%22arrivals%22%7D",
							},
						},
						service_alerts: {
							content: [
								{
									type: "text",
									text: "1 Service Alert(s):\n\n⚠️ REDUCED_SERVICE\n   Maintenance on B10 corridor\n   Affects: B10, B12\n",
								},
							],
							_meta: {
								ui: "ui://transmilenio-mcp/alerts?data=%7B%22type%22%3A%22alerts%22%7D",
							},
						},
						plan_route: {
							content: [
								{
									type: "text",
									text: "Route from Portal Norte to Museo Nacional\nTotal time: ~25 minutes\nWalking: 5 minutes\nTransfers: 0\n\nSteps:\n1. Walk 200m to Portal Norte (~3 min)\n2. Take B10 from Portal Norte to Calle 26 (~20 min)\n3. Walk 150m to Museo Nacional (~2 min)",
								},
							],
							_meta: {
								ui: "ui://transmilenio-mcp/route-map?data=%7B%22type%22%3A%22route-map%22%7D",
							},
						},
					},
					null,
					2,
				),
			);
		}

		const fixtures = JSON.parse(readFileSync(fixtureFile, "utf-8"));

		for (const tool of Object.keys(fixtures)) {
			const output = fixtures[tool] as ToolResultLike;
			results.push({
				tool,
				success: isSuccessfulToolResultFor(tool, output),
				output,
			});
		}
	} else {
		if (!process.env.CROMA_API_KEY) {
			return {
				success: false,
				command: "mcp",
				duration_ms: Date.now() - start,
				error: "CROMA_API_KEY required for live tests",
			};
		}

		const { createMCPTools } = await import("../src/lib/mcp/tools.js");
		const tools = createMCPTools();

		async function runTool(
			tool: string,
			fn: () => Promise<ToolResultLike>,
			options?: { multimodal?: boolean; portalCalle100?: boolean },
		): Promise<ToolResultLike | null> {
			try {
				const output = await fn();
				results.push({
					tool,
					success: isSuccessfulToolResultFor(tool, output, options),
					output,
				});
				return output;
			} catch (error) {
				results.push({
					tool,
					success: false,
					output: { error: String(error) },
				});
				return null;
			}
		}

		const findStopsResult = await runTool("find_stops", () =>
			tools.findStops({
				query: "Portal Norte",
				limit: 5,
			}),
		);

		const stopIdMatch = findStopsResult?.content
			?.map((item) => item.text ?? "")
			.join("\n")
			.match(/ID:\s*([A-Za-z0-9_-]+)/);
		const stopId = stopIdMatch?.[1];

		await runTool("stop_arrivals", async () => {
			if (!stopId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No stop id from find_stops to query arrivals",
						},
					],
				};
			}
			return tools.getStopArrivals({ stopId, limit: 5 });
		});

		await runTool("service_alerts", () =>
			tools.getServiceAlerts({ limit: 10 }),
		);

		await runTool(
			"plan_route",
			() =>
				tools.planRoute({
					origin: "Portal Norte",
					destination: "Calle 100",
					maxTransfers: 1,
					debug: verbose,
				}),
			{ portalCalle100: true },
		);

		// Named multimodal smoke: address → neighborhood across systems.
		try {
			const multimodal = await tools.planRoute({
				origin: "Calle 76 con Carrera 20, Bogotá",
				destination: "Colina Campestre, Bogotá",
				maxTransfers: 2,
				maxWalkMeters: 1200,
				debug: verbose,
			});
			results.push({
				tool: "plan_route_multimodal",
				success: isSuccessfulMultimodalPlanRouteResult(multimodal),
				output: multimodal,
			});
		} catch (error) {
			results.push({
				tool: "plan_route_multimodal",
				success: false,
				output: { error: String(error) },
			});
		}
	}

	const success = results.every((r) => r.success);

	if (flags.json) {
		console.log(JSON.stringify({ results, success }, null, 2));
	} else {
		console.log("\n🔧 MCP Tool Tests\n");
		for (const result of results) {
			const icon = result.success ? "✅" : "❌";
			console.log(`${icon} ${result.tool}`);
			if (!result.success && result.output) {
				console.log(`   Error: ${JSON.stringify(result.output)}`);
			}
			if (
				verbose &&
				(result.tool === "plan_route" ||
					result.tool === "plan_route_multimodal") &&
				result.output
			) {
				const text = (result.output as ToolResultLike).content
					?.map((item) => item.text ?? "")
					.join("\n");
				if (text?.includes("--- plan_route debug ---")) {
					console.log(text.slice(text.indexOf("--- plan_route debug ---")));
				} else if (text) {
					console.log(text);
				}
			}
		}
		console.log(`\n${success ? "✅ All MCP tests passed" : "❌ Some tests failed"}`);
	}

	return {
		success,
		command: "mcp",
		duration_ms: Date.now() - start,
		output: { results },
	};
}

async function runUITests(
	flags: Record<string, boolean | string>,
): Promise<VerifyResult> {
	const start = Date.now();
	const port = typeof flags.port === "string" ? parseInt(flags.port) : 3457;
	let browser: Browser | null = null;
	let devServer: ChildProcess | null = null;

	if (flags["dry-run"]) {
		console.log("Would render UI and capture screenshots at:", ARTIFACTS_DIR);
		return {
			success: true,
			command: "ui",
			duration_ms: Date.now() - start,
			output: { dry_run: true },
		};
	}

	mkdirSync(ARTIFACTS_DIR, { recursive: true });

	try {
		console.log("Starting dev server...");
		devServer = await startDevServer(port);
		console.log(`Dev server running on port ${port}`);

		browser = await chromium.launch({ headless: true });
		const context = await browser.newContext({
			viewport: { width: 1280, height: 800 },
		});
		const page = await context.newPage();

		await page.goto(`http://localhost:${port}`);
		await page.waitForLoadState("networkidle");

		const homeScreenshot = join(ARTIFACTS_DIR, "home.png");
		await page.screenshot({ path: homeScreenshot, fullPage: true });
		console.log(`Captured: ${homeScreenshot}`);

		await page.goto(`http://localhost:${port}/preview/route-map`);
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(2000);

		const routeMapScreenshot = join(ARTIFACTS_DIR, "route-map.png");
		await page.screenshot({ path: routeMapScreenshot, fullPage: true });
		console.log(`Captured: ${routeMapScreenshot}`);

		const artifacts = [homeScreenshot, routeMapScreenshot];

		await browser.close();
		browser = null;

		devServer.kill();
		devServer = null;

		if (flags.json) {
			console.log(
				JSON.stringify(
					{
						success: true,
						artifacts,
					},
					null,
					2,
				),
			);
		} else {
			console.log("\n🎨 UI Tests\n");
			console.log(`✅ Home page rendered`);
			console.log(`✅ Route map preview rendered`);
			console.log(`📁 Artifacts saved to: ${ARTIFACTS_DIR}`);
		}

		return {
			success: true,
			command: "ui",
			duration_ms: Date.now() - start,
			output: { artifacts },
		};
	} catch (error) {
		if (browser) await browser.close();
		if (devServer) devServer.kill();

		const message = error instanceof Error ? error.message : String(error);
		if (flags.json) {
			console.log(JSON.stringify({ success: false, error: message }, null, 2));
		} else {
			console.error(`❌ UI test failed: ${message}`);
		}

		return {
			success: false,
			command: "ui",
			duration_ms: Date.now() - start,
			error: message,
		};
	}
}

async function runNetworkTests(
	flags: Record<string, boolean | string>,
): Promise<VerifyResult> {
	const start = Date.now();

	if (flags["dry-run"]) {
		console.log(
			"Would validate data/network snapshot/graph and time local vs API plan_route",
		);
		return {
			success: true,
			command: "network",
			duration_ms: Date.now() - start,
			output: { dry_run: true },
		};
	}

	const { buildNetworkGraph } = await import(
		"../src/lib/network/build-graph.js"
	);
	const { checkNetworkIntegrity } = await import(
		"../src/lib/network/integrity.js"
	);
	const { planRouteLocal } = await import(
		"../src/lib/network/local-planner.js"
	);
	const { loadNetworkBundle, loadSnapshot, loadGraph } = await import(
		"../src/lib/network/store.js"
	);
	const { NetworkSnapshotSchema } = await import(
		"../src/lib/network/types.js"
	);
	const { RoutePlanner } = await import("../src/lib/routing/planner.js");

	const fixturePath = join(FIXTURES_DIR, "network", "mini-snapshot.json");
	const fixtureSnapshot = NetworkSnapshotSchema.parse(
		JSON.parse(readFileSync(fixturePath, "utf-8")),
	);
	const fixtureGraph = buildNetworkGraph(fixtureSnapshot);
	const fixtureReport = checkNetworkIntegrity(fixtureSnapshot, fixtureGraph);

	const liveBundle = loadNetworkBundle();
	const diskSnapshot = loadSnapshot();
	const diskGraph = loadGraph();
	const liveReport =
		diskSnapshot && diskGraph
			? checkNetworkIntegrity(diskSnapshot, diskGraph)
			: null;

	const localOrigin = {
		latitude: 4.6636,
		longitude: -74.0603,
		text: "Calle 76 con Carrera 20",
	};
	const localDest = {
		latitude: 4.7616,
		longitude: -74.0463,
		text: "Portal del Norte",
	};

	const t0 = Date.now();
	const localResult = await planRouteLocal(
		{ snapshot: fixtureSnapshot, graph: fixtureGraph, fresh: true },
		{
			origin: localOrigin,
			destination: localDest,
			maxTransfers: 2,
			maxWalkMeters: 1200,
		},
	);
	const localMs = Date.now() - t0;

	let apiMs: number | null = null;
	let apiKind: string | null = null;
	if (flags.live === true && process.env.CROMA_API_KEY) {
		const planner = new RoutePlanner();
		const t1 = Date.now();
		const apiResult = await planner.planRoute({
			origin: localOrigin,
			destination: localDest,
			maxTransfers: 2,
			maxWalkMeters: 1200,
			forceApi: true,
		});
		apiMs = Date.now() - t1;
		apiKind = apiResult.kind;
	}

	const success =
		fixtureReport.ok &&
		localResult.kind === "success" &&
		(liveReport ? liveReport.ok : true);

	const output = {
		fixture: fixtureReport,
		disk: liveReport,
		bundle_fresh: liveBundle?.fresh ?? false,
		perf: {
			local_plan_ms: localMs,
			api_plan_ms: apiMs,
			api_kind: apiKind,
			note:
				apiMs == null
					? "Pass --live with CROMA_API_KEY to compare API latency"
					: "Lower local_plan_ms vs api_plan_ms is expected after sync",
		},
	};

	if (flags.json) {
		console.log(JSON.stringify({ success, ...output }, null, 2));
	} else {
		console.log("\n🗺️  Network Checks\n");
		console.log(
			`${fixtureReport.ok ? "✅" : "❌"} fixture integrity (${fixtureReport.counts.stops} stops, ${fixtureReport.walk_edges} walk edges)`,
		);
		if (liveReport) {
			console.log(
				`${liveReport.ok ? "✅" : "❌"} disk snapshot integrity (${liveReport.counts.stops} stops, trunk ${liveReport.trunk_stations_reachable}/${liveReport.trunk_stations})`,
			);
		} else {
			console.log(
				"⚠️  no data/network snapshot yet — run `pnpm network:sync` with CROMA_API_KEY",
			);
		}
		console.log(
			`${localResult.kind === "success" ? "✅" : "❌"} local plan_route (fixture multimodal) in ${localMs}ms`,
		);
		if (apiMs != null) {
			console.log(`⏱️  API plan_route (forceApi) in ${apiMs}ms (${apiKind})`);
		}
		for (const issue of fixtureReport.issues) {
			console.log(`   fixture issue: ${issue.code} — ${issue.message}`);
		}
		for (const issue of liveReport?.issues ?? []) {
			console.log(`   disk issue: ${issue.code} — ${issue.message}`);
		}
	}

	return {
		success,
		command: "network",
		duration_ms: Date.now() - start,
		output,
	};
}

async function runAll(
	flags: Record<string, boolean | string>,
): Promise<VerifyResult> {
	const start = Date.now();
	const results: VerifyResult[] = [];

	console.log("🚀 Running all verifications...\n");

	results.push(await runDoctor(flags));
	results.push(await runMCPTests(flags));
	results.push(await runNetworkTests(flags));

	if (!flags["dry-run"]) {
		results.push(await runUITests(flags));
	}

	const success = results.every((r) => r.success);

	if (flags.json) {
		console.log(JSON.stringify({ results, success }, null, 2));
	} else {
		console.log("\n📊 Summary\n");
		for (const result of results) {
			const icon = result.success ? "✅" : "❌";
			console.log(`${icon} ${result.command}: ${result.duration_ms}ms`);
		}
		console.log(
			`\n${success ? "✅ All verifications passed" : "❌ Some verifications failed"}`,
		);
	}

	return {
		success,
		command: "all",
		duration_ms: Date.now() - start,
		output: { results },
	};
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const { command, flags } = parseArgs(args);

	if (flags.help || command === "help") {
		printHelp();
		process.exit(0);
	}

	let result: VerifyResult;

	switch (command) {
		case "doctor":
			result = await runDoctor(flags);
			break;
		case "mcp":
			result = await runMCPTests(flags);
			break;
		case "ui":
			result = await runUITests(flags);
			break;
		case "network":
			result = await runNetworkTests(flags);
			break;
		case "all":
			result = await runAll(flags);
			break;
		default:
			console.error(`Unknown command: ${command}`);
			printHelp();
			process.exit(2);
	}

	process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(2);
});
