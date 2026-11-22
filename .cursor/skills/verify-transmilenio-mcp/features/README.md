# TransMilenio MCP Verification Map

This directory is the maintained source for verifying the user-facing behavior of the TransMilenio MCP server. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline Preconditions

- Run `pnpm install` to install dependencies.
- Run `pnpm verify doctor` and require all critical checks to pass.
- For live API tests, set `CROMA_API_KEY` in the environment.
- For UI tests, Playwright must be installed (`npx playwright install chromium`).

## Driving Conventions

- Start every recipe from a clean state (no running dev server, fresh fixtures).
- Prefer the verification CLI (`pnpm verify`) over manual commands.
- Use `--json` output for scripted assertions.
- Use `--dry-run` before destructive operations.
- Capture evidence to `artifacts/` directory.

## Proof and Skip Reporting

- UI proof includes a screenshot with the timestamp visible.
- MCP proof includes the tool response (text content and `_meta.ui` reference).
- Report unreachable features with the error message and unmet precondition.
- Do not report a skipped feature as verified through a different path.

## Feature Entry Contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with the verification CLI` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Plan Route](./plan-route.md) - Plan a transit route between two locations with interactive map.
- [Find Stops](./find-stops.md) - Search for TransMilenio and SITP stops by name, location, or route.
- [Stop Arrivals](./stop-arrivals.md) - Get live arrival predictions at a stop.
- [Service Alerts](./service-alerts.md) - View current service disruptions and alerts.
