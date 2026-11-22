---
name: verify-transmilenio-mcp
description: "Verification skill for the TransMilenio MCP server. Use when testing MCP tools, rendering UI components, or verifying the app works end-to-end."
---

# Verify TransMilenio MCP

This skill drives the TransMilenio MCP server and its UI the way a user does: launch it, exercise each MCP tool, render the map UI, and capture evidence.

## Launch

Start the development server for verification:

```bash
pnpm dev --port 3457
```

Ready when the terminal shows `Ready in` or `started server on`. The MCP endpoint is at `http://localhost:3457/api/mcp`. Teardown: `Ctrl+C` or kill the process.

For MCP tool testing without the full Next.js server, import the tools directly:

```typescript
import { createMCPTools } from "./src/lib/mcp/tools.js";
const tools = createMCPTools();
```

## Doctor

Run a health check before any verification:

```bash
pnpm verify doctor
```

Checks:
- Node.js version (20+ required)
- Dependencies installed (`node_modules` exists)
- `CROMA_API_KEY` environment variable (required for live API)
- TypeScript configuration
- Test fixtures present

Pass: all critical checks green. Warn: optional items missing. Fail: missing dependencies or configuration.

## Drive

The verification CLI at `scripts/verify.ts` drives the app. All commands support `--json` for machine-readable output and `--dry-run` for preview.

### MCP Tools

Test MCP tools with fixture data:

```bash
pnpm verify mcp
```

Test with live Croma API (requires `CROMA_API_KEY`):

```bash
pnpm verify mcp --live
```

Tools tested:
- `find_stops` - Search for TransMilenio stations
- `stop_arrivals` - Get live arrivals at a stop
- `service_alerts` - Get service alerts
- `plan_route` - Plan a route between locations

### UI Rendering

Render UI components and capture screenshots:

```bash
pnpm verify ui
```

This starts the dev server, navigates to the home page, captures a screenshot, and saves it to `artifacts/`.

### Full Verification

Run all checks:

```bash
pnpm verify all
```

## Evidence

All evidence is captured to the `artifacts/` directory:
- `home.png` - Home page screenshot
- `route-map.png` - Route map rendering (when available)
- `stops-map.png` - Stops map rendering (when available)

Proof artifacts survive cleanup. The verification CLI never deletes evidence.

## Cleanup

The dev server started by `pnpm verify ui` is killed automatically after screenshots are captured. No manual cleanup needed.

To clean artifacts:

```bash
rm -rf artifacts/
```

## Helpers

The verification CLI (`scripts/verify.ts`) is the main helper. Run with `--help` for all options:

```bash
pnpm verify --help
```

Key flags:
- `--json` - Output as JSON for scripting
- `--dry-run` - Preview without executing
- `--live` - Use live Croma API instead of fixtures
- `--port NUM` - Dev server port (default: 3457)

## Feature Map

See `features/README.md` for the feature index and individual feature verification recipes.
