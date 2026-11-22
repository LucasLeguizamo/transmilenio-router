#!/usr/bin/env tsx
/**
 * Sync the local TransMilenio network snapshot from Croma (route-first, credit-aware).
 *
 * Usage:
 *   pnpm network:sync --estimate
 *   pnpm network:sync --max-calls 1200
 *   pnpm network:sync --json
 *   pnpm network:sync --dry-run --max-pages 1 --max-route-details 5
 *   pnpm network:sync --no-resume
 *   pnpm network:sync --help
 *
 * Output files (gitignored — do not commit; Croma ToS restrict redistributing the Service):
 *   data/network/snapshot.json
 *   data/network/graph.json
 *   data/network/sync-state.json (while in progress)
 *   data/croma-cache/ (HTTP response cache + ledger)
 */

import { getCromaClient, resetDefaultCromaClient } from "../src/lib/croma/client";
import { resetSharedLedger } from "../src/lib/croma/ledger";
import { DEFAULT_SYNC_MAX_CALLS } from "../src/lib/croma/paths";
import { estimateSyncCalls } from "../src/lib/network/estimate";
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
TransMilenio local network sync (route-first, credit-aware)

USAGE:
  pnpm network:sync [options]

OPTIONS:
  --estimate             Print projected call counts (no API key required)
  --json                 Machine-readable JSON result
  --dry-run              Fetch pages but do not write snapshot/graph
  --no-resume            Ignore sync-state.json and start fresh
  --rate-ms <n>          Delay between API calls (default 50)
  --max-calls <n>        Hard network-call budget (default ${DEFAULT_SYNC_MAX_CALLS})
  --max-pages <n>        Cap list pagination (smoke)
  --max-route-details <n> Cap route/v1 detail fetches (smoke)
  --help                 Show this help

STRATEGY:
  1. routes-search per system (page size ${100})
  2. route/v1 per id — patterns embed stop id/name/lat/lon
  3. Build stops from embeds (no geo stop shards / stop/v1 spam)
  Responses are cached under data/croma-cache/; resume skips cached calls.

ENV:
  CROMA_API_KEY          Required for live sync (not for --estimate)
  CROMA_MAX_CALLS        Default budget override
  NETWORK_MAX_AGE_HOURS  Freshness window for plan_route (default 168)

EXIT CODES:
  0  Sync completed (or estimate printed)
  1  Sync failed / budget / billing stop
  2  Invalid args / missing key
`);
}

async function main(): Promise<void> {
	const flags = parseArgs(process.argv.slice(2));
	if (flags.help) {
		printHelp();
		process.exit(0);
	}

	if (flags.estimate === true) {
		const estimate = estimateSyncCalls();
		if (flags.json) {
			console.log(JSON.stringify(estimate, null, 2));
		} else {
			console.log("\nCroma sync estimate (route-first)\n");
			console.log(`  Cold full sync:     ~${estimate.total_cold} network calls`);
			console.log(
				`    routes-search:    ~${estimate.routes_list_pages_projected} pages`,
			);
			console.log(
				`    route/v1:         ~${estimate.route_details_projected_cold}`,
			);
			console.log(
				`  This run projected: ~${estimate.total_projected} (cache hits free)`,
			);
			console.log(
				`  Fresh cached routes:${estimate.route_details_cached_fresh}`,
			);
			console.log(
				`  Refresh if warm:    ~${estimate.total_refresh_if_fresh} (re-list only)`,
			);
			for (const note of estimate.notes) {
				console.log(`  • ${note}`);
			}
		}
		process.exit(0);
	}

	if (!process.env.CROMA_API_KEY) {
		const payload = {
			success: false,
			error:
				"CROMA_API_KEY required. Get a key at https://usecroma.com — snapshot is not committed (Croma ToS). Use --estimate without a key.",
		};
		if (flags.json) console.log(JSON.stringify(payload, null, 2));
		else console.error(payload.error);
		process.exit(2);
	}

	const maxCalls =
		typeof flags["max-calls"] === "string"
			? parseInt(flags["max-calls"], 10)
			: DEFAULT_SYNC_MAX_CALLS;

	resetSharedLedger();
	resetDefaultCromaClient();
	const client = getCromaClient({ maxCalls });

	const estimate = estimateSyncCalls();
	if (!flags.json) {
		console.error(
			`Estimate: ~${estimate.total_projected} network calls this run (cold ~${estimate.total_cold}); budget ${maxCalls}`,
		);
	}

	const result = await syncNetwork({
		client,
		dryRun: flags["dry-run"] === true,
		resume: flags["no-resume"] !== true,
		rateMs:
			typeof flags["rate-ms"] === "string"
				? parseInt(flags["rate-ms"], 10)
				: 50,
		maxCalls,
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

	const ledgerSummary = client.getLedger().summary();

	if (flags.json) {
		console.log(
			JSON.stringify({ ...result, ledger: ledgerSummary, estimate }, null, 2),
		);
	} else {
		if (result.success) {
			console.log(
				result.dry_run
					? `Dry-run ok — would write ${result.counts?.stops ?? 0} stops / ${result.counts?.routes ?? 0} routes (${result.api_calls} network calls)`
					: `Synced ${result.counts?.stops ?? 0} stops / ${result.counts?.routes ?? 0} routes → ${result.paths?.snapshot} (${result.api_calls} network calls)`,
			);
		} else {
			console.error(`Sync stopped (${result.stopped_reason ?? "error"}):`);
			for (const err of result.errors) console.error(`  - ${err}`);
		}
		for (const warn of result.warnings) {
			console.error(`WARNING: ${warn}`);
		}
		console.error(
			`Ledger: ${ledgerSummary.network} network / ${ledgerSummary.hits} cache hits`,
		);
		if (result.budget) {
			console.error(
				`Budget: ${result.budget.used}/${result.budget.maxCalls ?? "∞"} used`,
			);
		}
	}

	process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
	console.error("Fatal:", error);
	process.exit(2);
});
