# Croma credit model

Croma bills **one credit per HTTP request** that hits their API. Cache hits, coalesced in-flight duplicates, and local snapshot reads cost **0**.

## Expected call counts

| Operation | Network calls | Notes |
|-----------|---------------|--------|
| `pnpm network:sync --estimate` | 0 | Projection only |
| Cold full sync (Bogotá) | **~1,060** | ~14 `routes-search` pages + ~1,045 `route/v1` |
| Resume / warm refresh | **0–14** | Cached `route/v1` reused (7d TTL); re-list if needed |
| Incremental after interrupt | remaining routes only | `--max-calls` stops cleanly; resume continues |
| `plan_route` | **0** | Local graph only |
| `find_stops` (with snapshot) | **0** | Local name / proximity search |
| `stop_arrivals` | 0–1 | 60s memory TTL + coalescing |
| `service_alerts` | 0–1 | 5 min memory TTL + coalescing |
| `pnpm verify mcp` (fixtures) | 0 | |
| `pnpm verify mcp --live` | **≤2** | 1 arrivals + 1 alerts (plan/find local) |

Cold sync formula (route-first):

```
total ≈ Σ_systems ceil(routes_in_system / 100)  +  unique_route_ids
     ≈ 14 + 1045 ≈ 1059
```

Stops are **not** fetched via geo `stops-search` shards (that burned ~1,000+ credits for a capped 1,000-stop page). Pattern embeds on `route/v1` supply stop id/name/lat/lon.

## Hard budget

```bash
pnpm network:sync --max-calls 1200   # default
pnpm network:sync --estimate        # no key required
```

When the budget is hit, sync **saves progress** and exits non-zero. Resume with the same command (default `--resume`).

## Billing (402)

HTTP **402** / `billing_error` / `plan_limit_reached` is **terminal**: no retries. The client surfaces the reset timestamp when present (e.g. `2026-12-22T20:30:54Z`). Wait for the period reset, then `pnpm network:sync` (cache still valid).

HTTP **429** uses exponential backoff (up to 4 attempts).

## Ledger & cache

| Path | Purpose |
|------|---------|
| `data/croma-cache/ledger.jsonl` | Every request: endpoint, params, cache hit/miss, credits headers if any |
| `data/croma-cache/responses/*.json` | Dataset responses (7d TTL) |

Both are gitignored (same redistribution concern as the snapshot).

## Runtime policy

1. **`plan_route`** — local snapshot/graph only. Missing/stale snapshot → clear `no_route` asking for sync. No live hop-by-hop fallback (that was the credit sink).
2. **Live tools** — short TTL memory cache + in-flight coalescing.
3. **`verify --live`** — minimal call set; prints ledger summary.

See also [network-sync.md](./network-sync.md) and [croma-integration.md](./croma-integration.md).
