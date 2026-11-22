# Local network sync

`plan_route` prefers a **local graph** of the whole TransMilenio / SITP network so it does not call Croma once per hop. Live data (arrivals, vehicles, alerts) still comes from Croma.

## Generate the snapshot

```bash
export CROMA_API_KEY=…
pnpm network:sync                 # writes data/network/snapshot.json + graph.json
pnpm network:sync --json          # agent-friendly
pnpm network:sync --dry-run --max-pages 1 --max-route-details 5
pnpm network:sync --no-resume     # ignore sync-state.json
pnpm network:sync --help
```

| Flag | Purpose |
|------|---------|
| `--json` | Machine-readable result |
| `--dry-run` | Fetch without writing artifacts |
| `--no-resume` | Start clean (default resumes) |
| `--rate-ms` | Delay between API calls (default `200`) |
| `--max-pages` / `--max-route-details` | Caps for smoke tests |

Sync is **idempotent** (re-run safe) and **resumable** via `data/network/sync-state.json`.

Croma’s OpenAPI documents that `stops-search` / `routes-search` `total` is counted up to **1000** (`total_is_exact: false` when there are more). Unfiltered paging alone therefore stops at ~1000. This sync:

1. Shards stops by `kind` (station/stop) and overlapping Bogotá geo boxes (`latitude`/`longitude`/`radius_m`)
2. Lists routes per `system`, then fetches `route/v1` patterns
3. **Backfills** any pattern-referenced stop id via `stop/v1` (stub from pattern coords if missing)
4. **Fails loudly** if final stop count is still ≤1000 or an unverified multiple of 1000

Use `--no-resume` after upgrading the syncer so an old capped state is not reused.

## What gets written

```
data/network/
  snapshot.json     # version, fetched_at, source, counts, stops[], routes[]
  graph.json        # stop→routes, route patterns, walking transfer edges
  sync-state.json   # only while a sync is in progress
  README.md
```

`NETWORK_MAX_AGE_HOURS` (default `168`) controls when `plan_route` treats the snapshot as stale and falls back to live hop-by-hop Croma routing.

## Verify

```bash
pnpm verify network           # fixture integrity + local plan latency
pnpm verify network --live    # also times forceApi plan_route (needs key)
```

Checks: count consistency, no dangling stop/route ids, trunk stations mutually reachable on the graph, and a multimodal fixture plan (Calle 76 area → Portal Norte / Colina path shape).

## Multimodal acceptance

After a full sync, live smoke includes:

```bash
pnpm verify mcp --live
# plan_route_multimodal: Calle 76 con Carrera 20, Bogotá → Colina Campestre, Bogotá
```

Expect ≥2 transit legs with different Croma `system` values, planned on the local graph when the snapshot is fresh.

## Licensing / attribution (why the snapshot is gitignored)

Croma’s [Terms of Service](https://usecroma.com/en/terms) §4: *“Resell or redistribute the Services except as expressly permitted in writing.”*  
§7: Croma owns the Services; underlying public records are not owned by Croma.

We treat a bulk extract of Croma dataset endpoints (stops/routes) as redistribution risk, so **`data/network/*.json` is gitignored**. Each environment runs `pnpm network:sync` with its own API key. Do not publish or commit the snapshot.

Attribute:

- **Source data:** TransMilenio S.A. / Bogotá integrated public transport (as published through Croma)
- **API:** [Croma](https://usecroma.com) dataset endpoints (`stops-search`, `stop`, `routes-search`, `route`)
- **Live:** vehicles, arrivals, alerts remain live Croma calls

See also [Croma datasets](https://docs.usecroma.com/datasets) (TransMilenio stop/route/departures are dataset-served; vehicles/arrivals/alerts are live).
