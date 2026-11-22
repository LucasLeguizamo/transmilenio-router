# Find Stops

Search for TransMilenio and SITP stops/stations by name, code, location, or route. Returns a list of matching stops with their routes and an interactive map showing their locations.

## Sub-features

- `find-by-name` - Search stops by name or code.
- `find-by-location` - Find stops near a coordinate.
- `find-by-route` - Find stops served by a specific route.
- `find-ui` - Render stops on an interactive map.

## How to get to it (user POV)

- Call the `find_stops` MCP tool.
- Parameters (all optional):
  - `query` - Text search for name or code
  - `latitude`, `longitude` - Center point for proximity search
  - `radiusMeters` - Search radius (default 500, max 5000)
  - `route` - Filter by route code (e.g., "B10")
  - `limit` - Maximum results (default 10)

## Driving it with the verification CLI

Preconditions:
- `pnpm verify doctor` passes.
- For live tests: `CROMA_API_KEY` is set.

- **Test with fixtures.** Run `pnpm verify mcp`. Check that `find_stops` appears in results with `success: true`. The response lists stops with names, IDs, and route codes.

- **Test with live API.** Run `pnpm verify mcp --live`. The response should contain real stop data from TransMilenio. Verify stop names are in Spanish and route codes follow patterns like "B10", "K86".

- **Verify text format.** The response text should show:
  - Number of stops found
  - For each stop: name, ID, and routes served
  - If proximity search: distance from center

- **Verify UI reference.** The `_meta.ui` URL should start with `ui://transmilenio-mcp/stops-map`. The UI renders stops as colored dots on a Leaflet map.

## Gotchas

- Empty `query` returns nothing unless `latitude`/`longitude` is provided. At least one search parameter is needed.
- Proximity search requires both `latitude` and `longitude`. Providing only one is an error.
- The `radiusMeters` parameter has a maximum of 5000. Values above are clamped.
- Stop codes (like "B096") are different from stop IDs (like "10001"). The `query` parameter matches both.
