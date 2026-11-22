# Plan Route

Plan a TransMilenio route between two locations in Bogotá. Returns step-by-step directions with an interactive map showing the route polyline, stations, transfer points, and estimated travel time.

## Sub-features

- `plan-direct` - Plan a direct route with no transfers.
- `plan-transfer` - Plan a route requiring one or more transfers.
- `plan-walk` - Include walking segments to/from stations.
- `plan-alerts` - Show service alerts affecting the route.
- `plan-ui` - Render an interactive map with the route.

## How to get to it (user POV)

- Call the `plan_route` MCP tool with origin and destination.
- Origin and destination can be text (address, landmark, station name) or coordinates ("lat,lon").
- Optional parameters: `maxWalkMeters`, `maxTransfers`.

## Driving it with the verification CLI

Preconditions:
- `pnpm verify doctor` passes.
- For live tests: `CROMA_API_KEY` is set.

- **Test with fixtures.** Run `pnpm verify mcp`. Check that `plan_route` appears in the results with `success: true`. The response includes text directions and a `_meta.ui` URL.

- **Test with live API.** Run `pnpm verify mcp --live`. Verify the response contains actual route data from Croma. Check that the text includes "Route from" and "Total time".

- **Debug route search.** Run `pnpm verify mcp --live --verbose` to dump candidate stops (with platforms), shared `route_codes`/`route_ids`, and per-candidate match outcomes when diagnosing "No route found".

- **Verify UI rendering.** The `_meta.ui` URL in the response should start with `ui://transmilenio-mcp/route-map`. When rendered by an MCP Apps host, it displays an interactive Leaflet map.

- **Check route details.** The text response should include:
  - Origin and destination names
  - Total estimated time in minutes
  - Walking time
  - Number of transfers
  - Step-by-step directions

- **Check alert inclusion.** If there are service alerts affecting the route, they should be mentioned at the end of the text response.

## Gotchas

- The Croma API does not provide full graph-based routing. The planner uses a heuristic approach based on shared routes between stops. Routes may not be optimal.
- Text-based origin/destination uses stop search as a geocoding proxy. Addresses that don't match a stop name may fail to resolve.
- The `_meta.ui` URL contains embedded JSON data. Very long routes may hit URL length limits in some hosts.
- Transfer routes are slower to compute because they search multiple route combinations. Use `maxTransfers: 0` to force direct-only routes.
