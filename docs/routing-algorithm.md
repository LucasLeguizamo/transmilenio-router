# Routing Algorithm

This document describes the route planning algorithm used by the TransMilenio MCP server.

## Overview

The routing algorithm finds transit routes between two points in Bogotá using TransMilenio and SITP data from the Croma API.

**Important:** This is a heuristic algorithm, not an optimal pathfinder. The Croma API provides stop and route data but not graph-based routing. See [Limitations](#limitations) for details.

## Algorithm Steps

### 1. Location Resolution

Convert origin and destination to coordinates.

**Coordinate input:**
```
"4.6486,-74.0633" → { latitude: 4.6486, longitude: -74.0633 }
```

**Station / stop name:**
```
"Portal Norte" → Croma stops-search → keep matched stations as board candidates
```

**Address / intersection / neighborhood (multimodal):**
```
"Calle 76 con Carrera 20, Bogotá" → Nominatim (Bogotá heuristics) → lat/lon
"Colina Campestre, Bogotá" → Nominatim neighborhood → lat/lon
```

Addresses use Bogotá patterns (`Calle X con Carrera Y`, `Calle X # Y`). Station-like names such as `Calle 100` stay on Croma stop search.

### 2. Nearby Stop Search

Find stops within walking distance of origin and destination — **all Croma systems** (`troncal`, `zonal_urbano`, `alimentador`, …), not only trunk stations.

```
Croma API: POST /co/transmilenio/stops-search/v1
{
  latitude: origin.latitude,
  longitude: origin.longitude,
  radius_m: maxWalkMeters,  // default 800; geocoded endpoints use ≥1200
  kind: "station"           // then again without kind for street / zonal stops
}
```

Stations are preferred for connectivity; street stops and feeders are merged so multimodal trips can start or end off the trunk.

### 3. Direct Route Search

For each origin stop × destination stop pair:

```
if originStop.route_ids ∩ destStop.route_ids ≠ ∅:
    // Direct route found
    route = first shared route
    return buildDirectRoute(originStop, destStop, route)
```

This finds routes that serve both the origin and destination stops.

### 4. Multimodal Transfer Search

If no direct route exists, search for one-transfer routes **across systems**, including a short walk between nearby hubs:

```
for each originStop / originRoute / pattern stop after board:
    hubs = [pattern stop] ∪ nearby stops within ~350m (any system)
    for each hub that shares a route_code/route_id with destination:
        prefer hub.system ≠ origin.system (e.g. zonal_urbano → troncal)
        build: walk → transit(system A) → transfer/walk → transit(system B) → walk
```

Acceptance example: `Calle 76 con Carrera 20, Bogotá` → `Colina Campestre, Bogotá` should yield ≥2 transit legs with different `system` values (e.g. SITP Urbano + TransMilenio).

### 5. Route Building

Assemble the route plan with segments:

**Walk segment:**
```typescript
{
  kind: "walk",
  from: { latitude, longitude, name },
  to: { stop_id, name, latitude, longitude },
  distanceMeters: number,
  estimatedMinutes: number  // 4.5 km/h walking speed
}
```

**Transit segment:**
```typescript
{
  kind: "transit",
  route: { route_id, short_name, long_name, system, color },
  boardStop: { stop_id, name, latitude, longitude },
  alightStop: { stop_id, name, latitude, longitude },
  intermediateStops: [...],
  estimatedMinutes: number,
  geometry: [[lng, lat], ...] | null
}
```

**Transfer segment:**
```typescript
{
  kind: "transfer",
  fromStop: { stop_id, name, latitude, longitude },
  toStop: { stop_id, name, latitude, longitude },
  walkMinutes: 3  // fixed transfer time
}
```

### 6. Travel Time Estimation

**Walking:** `distance_km / 4.5 * 60` minutes

**Transit:** Uses scheduled minutes from route patterns if available, otherwise `2 minutes × stops`.

**Transfers:** Fixed 3 minutes (platform-to-platform within station).

### 7. Alert Retrieval

Fetch service alerts for routes in the plan:

```
for each route in plan:
    alerts += Croma API: POST /co/transmilenio/alerts/v1
              { route: route.route_id }
```

Alerts are deduplicated by `alert_id`.

## Code Location

The routing algorithm is implemented in:

- `src/lib/routing/planner.ts` - Main algorithm
- `src/lib/routing/types.ts` - Type definitions

Key functions:
- `planRoute()` - Entry point
- `findDirectRoute()` - Direct route search
- `findTransferRoute()` - Transfer route search
- `resolveLocation()` - Coordinate/text resolution
- `estimateTransitTime()` - Time estimation

## Limitations

### Not Optimal

The algorithm finds **a** route, not **the best** route. It:

- Stops at the first valid route found
- Doesn't compare alternatives
- Doesn't minimize total time or transfers

### No Graph Data

The Croma API doesn't provide:

- Stop-to-stop travel times
- Transfer penalties
- Walking connections between nearby stops
- Real-time crowding or delays

### Limited Transfers

Currently supports only one transfer. Multi-transfer routes require:

- Deeper search (exponential complexity)
- Better heuristics to avoid search explosion

### Text Resolution

Text origins/destinations only work for:

- Stop names
- Station names
- Route codes

Addresses and landmarks don't resolve.

## Future Improvements

### Better Routing

- Implement A* or Dijkstra with estimated travel times
- Build a transit graph at startup
- Consider multiple route alternatives

### Real-Time Integration

- Adjust estimates based on live arrival data
- Avoid routes with active service alerts
- Include crowding information

### Transfer Logic

- Support multiple transfers
- Find walking connections between nearby stops
- Use actual transfer times from data

### Geocoding

- Integrate OpenStreetMap Nominatim for address lookup
- Use fuzzy matching for stop names
