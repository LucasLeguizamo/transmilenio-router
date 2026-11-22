# Local network snapshot (gitignored)

| File | Purpose |
|------|---------|
| `snapshot.json` | Compact stops + routes with ordered patterns |
| `graph.json` | stop→routes, patterns, walk transfer edges |
| `sync-state.json` | Resume cursor while a sync is in progress |

Generate:

```bash
pnpm network:sync --estimate   # projected credits (no key)
pnpm network:sync --max-calls 1200
```

HTTP cache + ledger live in `data/croma-cache/` (also gitignored).

## Credit-aware sync

Route-first: list routes per system, fetch `route/v1` (stops embedded in patterns). Cold sync ≈ **1,060** network calls; warm refresh ≈ **0–14**. See [docs/croma-credits.md](../../docs/croma-credits.md).

## Licensing

Croma’s [Terms of Service](https://usecroma.com/en/terms) (§4) forbid reselling or **redistributing the Services** except with written permission. The snapshot is a bulk extract of Croma dataset endpoints. We keep it **local/generated** (see `.gitignore`) and attribute TransMilenio S.A. / Croma in the docs.
