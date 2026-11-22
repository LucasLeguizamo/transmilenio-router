#!/usr/bin/env tsx
/**
 * Sync the local TransMilenio network snapshot from Croma.
 *
 * Usage:
 *   pnpm network:sync
 *   pnpm network:sync --json
 *   pnpm network:sync --dry-run --max-pages 1 --max-route-details 5
 *   pnpm network:sync --no-resume
 *   pnpm network:sync --help
 *
 * Output files (gitignored — do not commit; Croma ToS restrict redistributing the Service):
 *   data/network/snapshot.json
 *   data/network/graph.json
 *   data/network/sync-state.json (while in progress)
 */

import { getCromaClient } from "../src/lib/croma/client";
import { syncNetwork } from "../src/lib/network/sync";

function parseArgs(args: string[]): Record<string, string | boolean> {
	const flags: Record<string, string | boolean> = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		const next = args[i + 1];
		if (next && !next.startsWith("--")) {
			flags[key] = next;
			i += 1;
		} else {
			flags[key] = true;
		}
	}
	return flags;
}

function printHelp(): void {
	console.log(`
TransMilenio local network sync

USAGE:
  pnpm network:sync [options]

OPTIONS:
  --json                 Machine-readable JSON result
  --dry-run              Fetch pages but do not write snapshot/graph
  --no-resume            Ignore sync-state.json and start fresh
  --rate-ms <n>          Delay between API calls (default 200)
  --max-pages <n>        Cap list pagination (useful for smoke/dry-run)
  --max-route-details <n> Cap route/v1 detail fetches
  --help                 Show this help

ENV:
  CROMA_API_KEY          Required for live sync
  NETWORK_MAX_AGE_HOURS  Freshness window for plan_route (default 168)

EXIT CODES:
  0  Sync completed (or dry-run completed)
  1  Sync failed
  2  Invalid args / missing key
`);
}

async function main(): Promise<void> {
	const flags = parseArgs(process.argv.slice(2));
	if (flags.help) {
		printHelp();
		process.exit(0);
	}

	if (!process.env.CROMA_API_KEY) {
		const payload = {
			success: false,
			error:
				"CROMA_API_KEY required. Get a key at https://usecroma.com — snapshot is not committed (Croma ToS).",
		};
		if (flags.json) console.log(JSON.stringify(payload, null, 2));
		else console.error(payload.error);
		process.exit(2);
	}

	const client = getCromaClient();
	const result = await syncNetwork({
		client,
		dryRun: flags["dry-run"] === true,
		resume: flags["no-resume"] !== true,
		rateMs:
			typeof flags["rate-ms"] === "string"
				? parseInt(flags["rate-ms"], 10)
				: 200,
		maxPages:
			typeof flags["max-pages"] === "string"
				? parseInt(flags["max-pages"], 10)
				: undefined,
		maxRouteDetails:
			typeof flags["max-route-details"] === "string"
				? parseInt(flags["max-route-details"], 10)
				: undefined,
		onProgress: (event) => {
			if (!flags.json) {
				console.error(`[${event.phase}] ${event.message}`);
			}
		},
	});

	if (flags.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		if (result.success) {
			console.log(
				result.dry_run
					? `Dry-run ok — would write ${result.counts?.stops ?? 0} stops / ${result.counts?.routes ?? 0} routes (${result.api_calls} API calls)`
					: `Synced ${result.counts?.stops ?? 0} stops / ${result.counts?.routes ?? 0} routes → ${result.paths?.snapshot}`,
			);
		} else {
			console.error("Sync failed:");
			for (const err of result.errors) console.error(`  - ${err}`);
		}
	}

	process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
	console.error("Fatal:", error);
	process.exit(2);
});
