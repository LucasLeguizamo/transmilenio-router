# Service Alerts

Get current service alerts for TransMilenio and SITP, including detours, delays, closures, and other disruptions. Shows affected routes and stops with active periods.

## Sub-features

- `alerts-list` - List all active service alerts.
- `alerts-by-route` - Filter alerts affecting a specific route.
- `alerts-by-stop` - Filter alerts affecting a specific stop.
- `alerts-ui` - Render alerts in a styled list with severity indicators.

## How to get to it (user POV)

- Call the `service_alerts` MCP tool.
- Parameters (all optional):
  - `route` - Filter by route code
  - `stopId` - Filter by stop ID

## Driving it with the verification CLI

Preconditions:
- `pnpm verify doctor` passes.
- For live tests: `CROMA_API_KEY` is set.

- **Test with fixtures.** Run `pnpm verify mcp`. Check that `service_alerts` appears in results with `success: true`. The fixture shows an example maintenance alert.

- **Test with live API.** Run `pnpm verify mcp --live`. The response shows current alerts from TransMilenio. If no alerts are active, it says "No active service alerts."

- **Verify text format.** For each alert, the response should show:
  - Effect type (DETOUR, NO_SERVICE, REDUCED_SERVICE, etc.)
  - Alert header/title
  - Affected routes

- **Verify UI reference.** The `_meta.ui` URL should start with `ui://transmilenio-mcp/alerts`. The UI shows alerts as cards with icons, severity colors, and affected route badges.

## Gotchas

- Alerts are time-sensitive. Live API tests may return "No active service alerts" when the network has no current disruptions.
- The fixture data includes a sample alert for consistent testing. It does not reflect actual service conditions.
- Alert text is in Spanish as published by TransMilenio. No translation is applied.
- The `active_periods` array may be empty for indefinite alerts. Check both `start` and `end` for null.
