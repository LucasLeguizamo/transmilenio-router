# Local network snapshot (gitignored)

This directory holds the **local TransMilenio/SITP network map** used by `plan_route`:

| File | Purpose |
|------|---------|
| `snapshot.json` | Compact stops + routes with ordered patterns |
| `graph.json` | Precomputed `stop→routes`, patterns, walking transfer edges |
| `sync-state.json` | Resumable progress while `pnpm network:sync` runs |

## Generate

```bash
export CROMA_API_KEY=…
pnpm network:sync
# smoke / CI without writing:
pnpm network:sync --dry-run --max-pages 1 --max-route-details 5 --json
```

## Why these files are not in git

Croma’s [Terms of Service](https://usecroma.com/en/terms) (§4) forbid reselling or **redistributing the Services** except with written permission. The snapshot is a bulk extract of Croma dataset endpoints. We keep it **local/generated** (see `.gitignore`) and attribute TransMilenio S.A. / Croma in the docs.

Live endpoints (arrivals, vehicles, alerts) are **not** stored here — `plan_route` still calls Croma for those after a local graph search.
