# Local network sync

`plan_route` uses a **local graph** of the TransMilenio / SITP network (**0 Croma credits** per plan). Live data (arrivals, alerts) still comes from Croma with short TTL caches.

Credit math and budgets: **[croma-credits.md](./croma-credits.md)**.

## Estimate before spending

```bash
pnpm network:sync --estimate
pnpm network:sync --estimate --json
```

No API key required. Prints projected network calls for a cold sync vs this run (given local cache).

| Mode | Typical network calls |
|------|------------------------|
| Cold full sync | ~1,060 (~14 list pages + ~1,045 `route/v1`) |
| Warm refresh | ~0–14 (reuse cached `route/v1`) |
| Resume after budget stop | only remaining route ids |

## Generate the snapshot

```bash
export CROMA_API_KEY=…
pnpm network:sync --estimate          # always first
pnpm network:sync --max-calls 1200    # default budget; saves progress if hit
pnpm network:sync --json
pnpm network:sync --dry-run --max-pages 1 --max-route-details 5
pnpm network:sync --no-resume         # ignore sync-state (HTTP cache still used)
pnpm network:sync --help
```

| Flag | Purpose |
|------|---------|
| `--estimate` | Projected calls; no key |
| `--json` | Machine-readable result + ledger |
| `--dry-run` | Fetch without writing snapshot/graph |
| `--no-resume` | Ignore `sync-state.json` |
| `--rate-ms` | Delay between calls (default `50`) |
| `--max-calls` | Hard network budget (default `1200`) |
| `--max-pages` / `--max-route-details` | Smoke caps |

### Route-first strategy (credit-aware)

1. `routes-search` per `system` at page size 100  
2. `route/v1` per id — patterns embed stop id/name/lat/lon  
3. Build `stops[]` from embeds (no geo `stops-search` shards, no `stop/v1` spam)

Raw responses land in `data/croma-cache/` (gitignored). Resume and refresh skip cache hits. **402 billing** stops immediately (no retries) with the reset date when present; **429** backs off.

## What gets written

```
data/network/
  snapshot.json     # version, fetched_at, source, counts, stops[], routes[]
  graph.json        # stop→routes, route patterns, walking transfer edges
  sync-state.json   # only while a sync is in progress
  README.md
data/croma-cache/
  responses/        # dataset HTTP cache (7d TTL)
  ledger.jsonl      # every request: endpoint, params, hit/miss, credits headers
```

`NETWORK_MAX_AGE_HOURS` (default `168`) controls when `plan_route` treats the snapshot as stale.

## Verify

```bash
pnpm verify network           # fixture + local plan (0 credits)
pnpm verify network --live    # also times disk snapshot plan (still 0 credits)
pnpm verify mcp --live        # ≤2 live calls (arrivals + alerts); plans are local
```

## Licensing / attribution (why the snapshot is gitignored)

Croma’s [Terms of Service](https://usecroma.com/en/terms) §4: *“Resell or redistribute the Services except as expressly permitted in writing.”*  
§7: Croma owns the Services; underlying public records are not owned by Croma.

We treat a bulk extract of Croma dataset endpoints (stops/routes) as redistribution risk, so **`data/network/*.json` and `data/croma-cache/` are gitignored**. Each environment runs `pnpm network:sync` with its own API key. Do not publish or commit the snapshot or cache.

Attribute:

- **Source data:** TransMilenio S.A. / Bogotá integrated public transport (as published through Croma)
- **API:** [Croma](https://usecroma.com) dataset endpoints (`routes-search`, `route`)
- **Live:** arrivals/alerts remain live Croma calls (cached briefly)
