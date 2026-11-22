# Croma API Integration

This document describes the integration with the [Croma API](https://usecroma.com) for TransMilenio data.

## Overview

Croma provides real-time and static data for Bogotá's public transit system including:

- TransMilenio (BRT trunk routes)
- Feeders (alimentadores)
- SITP (zonal buses)
- TransMiCable (cable car)

For **route planning performance**, this project syncs stop/route dataset endpoints into a local snapshot (`pnpm network:sync`) and plans against that graph. Live endpoints (arrivals, vehicles, alerts) are still called at request time. Licensing notes and why the snapshot is not committed: [network-sync.md](./network-sync.md).

## API Reference

Base URL: `https://api.croma.run`

Authentication: Bearer token via `Authorization` header

```
Authorization: Bearer <CROMA_API_KEY>
```

### Endpoints Used

#### Stops Search

```
POST /co/transmilenio/stops-search/v1
```

Search stops by name, code, location, or route.

**Request:**
```json
{
  "query": "Portal Norte",
  "latitude": 4.6486,
  "longitude": -74.0633,
  "radius_m": 500,
  "route": "B10",
  "kind": "station",
  "page": 1,
  "per_page": 20
}
```

**Response:**
```json
{
  "data": {
    "as_of": "2024-01-15T10:00:00-05:00",
    "total": 5,
    "stops": [
      {
        "stop_id": "10001",
        "code": "B096",
        "name": "Portal Norte",
        "kind": "station",
        "latitude": 4.7616,
        "longitude": -74.0463,
        "route_ids": ["10075", "10076"],
        "route_codes": ["B10", "B12"]
      }
    ]
  }
}
```

#### Stop Details

```
POST /co/transmilenio/stop/v1
```

Get details for a single stop.

**Request:**
```json
{
  "stop_id": "10001"
}
```

#### Routes Search

```
POST /co/transmilenio/routes-search/v1
```

Search routes by code, destination, or stop.

**Request:**
```json
{
  "query": "B10",
  "system": "troncal",
  "stop_id": "10001"
}
```

#### Route Details

```
POST /co/transmilenio/route/v1
```

Get route details including patterns and geometry.

**Request:**
```json
{
  "route_id": "10075",
  "include_geometry": true
}
```

The `include_geometry: true` flag returns GeoJSON LineString coordinates for the route path.

#### Live Arrivals

```
POST /co/transmilenio/stop-arrivals/v1
```

Get real-time arrival predictions.

**Request:**
```json
{
  "stop_id": "10001",
  "route": "B10",
  "limit": 10
}
```

**Response:**
```json
{
  "data": {
    "live": true,
    "arrivals": [
      {
        "predicted_at": "2024-01-15T10:05:00-05:00",
        "minutes_away": 3,
        "basis": "predicted",
        "delay_seconds": 120,
        "route_code": "B10"
      }
    ]
  }
}
```

The `live` field indicates whether real-time data is available. When `false`, arrivals fall back to scheduled times.

#### Service Alerts

```
POST /co/transmilenio/alerts/v1
```

Get active service alerts.

**Request:**
```json
{
  "route": "B10",
  "stop_id": "10001"
}
```

## TypeScript Types

All API responses are validated using Zod schemas defined in `src/lib/croma/types.ts`.

```typescript
import { z } from "zod";

export const Stop = z.object({
  stop_id: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  kind: z.enum(["stop", "station", "entrance", "node", "boarding_area"]),
  latitude: z.number(),
  longitude: z.number(),
  route_ids: z.array(z.string()),
  route_codes: z.array(z.string()),
  // ...
});

export type Stop = z.infer<typeof Stop>;
```

## Error Handling

The client returns discriminated union results:

```typescript
type CromaResult<T> =
  | { kind: "success"; data: T }
  | { kind: "error"; status: number; code: string; message: string };
```

Handle both cases:

```typescript
const result = await client.searchStops({ query: "Portal" });

if (result.kind === "error") {
  console.error(`API error: ${result.message}`);
  return;
}

const stops = result.data.data.stops;
```

## Rate Limits

Croma enforces rate limits per organization. Headers on each response:

- `RateLimit-Policy`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

The client does not currently implement automatic rate limit handling. For high-volume use, implement backoff based on these headers.

## Credits

Croma charges credits per API call. Check [Croma pricing](https://usecroma.com/pricing) for current rates. The client does not track credit usage.

## Code Location

- `src/lib/croma/client.ts` - API client
- `src/lib/croma/types.ts` - Zod schemas

## Testing

### With Fixtures

Tests use fixture data in `tests/__fixtures__/` to avoid API calls:

```bash
pnpm verify mcp
```

### With Live API

Requires `CROMA_API_KEY`:

```bash
pnpm verify mcp --live
```

## References

- [Croma Documentation](https://docs.usecroma.com)
- [Croma OpenAPI Spec](https://usecroma.com/openapi.json)
- [Croma MCP Server](https://api.croma.run/mcp)
