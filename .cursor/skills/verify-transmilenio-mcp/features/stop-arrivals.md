# Stop Arrivals

Get live arrival predictions for buses at a TransMilenio or SITP stop. Shows real-time predicted arrival times when the network is publishing live data, or scheduled times otherwise.

## Sub-features

- `arrivals-live` - Display live predictions when available.
- `arrivals-scheduled` - Fall back to scheduled times when live data unavailable.
- `arrivals-filter` - Filter arrivals by route code.
- `arrivals-ui` - Render arrivals in a styled list.

## How to get to it (user POV)

- Call the `stop_arrivals` MCP tool.
- Parameters:
  - `stopId` (required) - The stop ID to get arrivals for
  - `route` (optional) - Filter by route code
  - `limit` (optional) - Maximum arrivals (default 10)

## Driving it with the verification CLI

Preconditions:
- `pnpm verify doctor` passes.
- For live tests: `CROMA_API_KEY` is set.
- A valid stop ID is needed (use `find_stops` to get one).

- **Test with fixtures.** Run `pnpm verify mcp`. Check that `stop_arrivals` appears in results with `success: true`. The fixture shows example arrivals at Portal Norte.

- **Test with live API.** Run `pnpm verify mcp --live`. Use a known stop ID like "10001". The response shows live or scheduled arrivals.

- **Verify text format.** The response text should show:
  - Stop name
  - Live or Scheduled data indicator
  - For each arrival: route code and time (minutes away or clock time)
  - Delay information if available

- **Verify UI reference.** The `_meta.ui` URL should start with `ui://transmilenio-mcp/arrivals`. The UI shows a styled list with route badges and countdown times.

## Gotchas

- The stop ID must be exact. Use `find_stops` to discover valid IDs.
- If the stop is not found, the response says "Stop not found" with the ID.
- Live data depends on TransMilenio's real-time feed. If the feed is down, arrivals fall back to scheduled data with a "(Scheduled data)" indicator.
- The `basis` field in arrivals indicates: "predicted" (network prediction), "estimated" (calculated from last known position), or "scheduled" (from timetable).
