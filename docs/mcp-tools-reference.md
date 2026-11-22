# MCP Tools Reference

This document describes the MCP tools exposed by the TransMilenio MCP server.

## Overview

The server exposes four tools following the Model Context Protocol:

| Tool | Description |
|------|-------------|
| `plan_route` | Plan a transit route between two locations |
| `find_stops` | Search for stops by name, location, or route |
| `stop_arrivals` | Get live arrival predictions at a stop |
| `service_alerts` | Get current service alerts |

Each tool returns:
- `content[]` - Text description of the result
- `_meta.ui` - Optional UI resource URL

## plan_route

Plan a TransMilenio route between two locations.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "origin": {
      "type": "string",
      "description": "Origin as text (address, landmark, station) or 'lat,lon'"
    },
    "destination": {
      "type": "string",
      "description": "Destination as text or 'lat,lon'"
    },
    "maxWalkMeters": {
      "type": "number",
      "description": "Maximum walking distance (default 800)"
    },
    "maxTransfers": {
      "type": "number",
      "description": "Maximum transfers (default 2)"
    }
  },
  "required": ["origin", "destination"]
}
```

### Example Call (station → station)

```json
{
  "name": "plan_route",
  "arguments": {
    "origin": "Portal Norte",
    "destination": "Calle 100",
    "maxTransfers": 1
  }
}
```

### Example Call (multimodal: address → neighborhood)

```json
{
  "name": "plan_route",
  "arguments": {
    "origin": "Calle 76 con Carrera 20, Bogotá",
    "destination": "Colina Campestre, Bogotá",
    "maxTransfers": 2,
    "maxWalkMeters": 1200
  }
}
```

Live smoke: `pnpm verify mcp --live` includes this pair as `plan_route_multimodal` and requires ≥2 transit legs with different Croma `system` values.

### Response

Transit legs are labeled with transport type (`Label/system`):

```text
2. Take 466 (SITP Urbano/zonal_urbano) from Calle 76 / Carrera 20 to Calle 100 (~18 min)
3. Transfer at Calle 100 (SITP) → Calle 100 (TransMilenio) (~4 min)
4. Take B907 (TransMilenio/troncal) from Calle 100 to Portal del Norte (~16 min)
```

### UI Resource

The `_meta.ui` URL renders an interactive map showing:
- Route polylines colored **per Croma system** (troncal red, zonal blue, alimentador green, …)
- Distinct board/alight badges per transport type
- Origin marker (green) / destination marker (red)
- Transfer marker (⇄) and dashed walk between hubs when systems change
- Legend of systems used on the trip

See also the preview screenshot: `docs/images/multimodal-route-map.png`.

### Error Cases

- **No route found:** Returns text explaining why (too far, no connection)
- **Location not resolved:** Origin or destination text didn't match a stop
- **API error:** Croma API unavailable

---

## find_stops

Search for TransMilenio and SITP stops.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search by name or code"
    },
    "latitude": {
      "type": "number",
      "description": "Latitude for proximity search"
    },
    "longitude": {
      "type": "number",
      "description": "Longitude for proximity search"
    },
    "radiusMeters": {
      "type": "number",
      "description": "Search radius (default 500, max 5000)"
    },
    "route": {
      "type": "string",
      "description": "Filter by route code (e.g., 'B10')"
    },
    "limit": {
      "type": "number",
      "description": "Max results (default 10)"
    }
  }
}
```

### Example Calls

**By name:**
```json
{
  "name": "find_stops",
  "arguments": {
    "query": "Portal Norte",
    "limit": 5
  }
}
```

**By location:**
```json
{
  "name": "find_stops",
  "arguments": {
    "latitude": 4.6486,
    "longitude": -74.0633,
    "radiusMeters": 500
  }
}
```

**By route:**
```json
{
  "name": "find_stops",
  "arguments": {
    "route": "B10"
  }
}
```

### Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 3 stop(s):\n\n• Portal Norte\n  ID: 10001 | Routes: B10, B12, K86\n• Calle 127\n  ID: 10002 | Routes: B10, B73\n..."
    }
  ],
  "_meta": {
    "ui": "ui://transmilenio-mcp/stops-map?data=..."
  }
}
```

### UI Resource

The `_meta.ui` URL renders a map showing:
- Stop markers colored by system (troncal, alimentador, zonal)
- Search center (if proximity search)
- Popups with stop details

---

## stop_arrivals

Get live arrival predictions at a stop.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "stopId": {
      "type": "string",
      "description": "Stop ID to get arrivals for"
    },
    "route": {
      "type": "string",
      "description": "Filter by route code"
    },
    "limit": {
      "type": "number",
      "description": "Max arrivals (default 10)"
    }
  },
  "required": ["stopId"]
}
```

### Example Call

```json
{
  "name": "stop_arrivals",
  "arguments": {
    "stopId": "10001",
    "limit": 5
  }
}
```

### Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "Arrivals at Portal Norte\n(Live data)\n\n• B10: 3 min\n• K86: 7 min (+2 min late)\n• B12: 12 min"
    }
  ],
  "_meta": {
    "ui": "ui://transmilenio-mcp/arrivals?data=..."
  }
}
```

### UI Resource

The `_meta.ui` URL renders an arrival board showing:
- Stop name and ID
- Live/Scheduled indicator
- Route badges with colors
- Countdown or clock time
- Delay information

### Data Freshness

The `live` field in the response indicates whether real-time predictions are available. When TransMilenio's feed is down, arrivals fall back to scheduled times with a "(Scheduled data)" indicator.

---

## service_alerts

Get current service alerts.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "route": {
      "type": "string",
      "description": "Filter by route code"
    },
    "stopId": {
      "type": "string",
      "description": "Filter by stop ID"
    }
  }
}
```

### Example Calls

**All alerts:**
```json
{
  "name": "service_alerts",
  "arguments": {}
}
```

**By route:**
```json
{
  "name": "service_alerts",
  "arguments": {
    "route": "B10"
  }
}
```

### Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "2 Service Alert(s):\n\n⚠️ REDUCED_SERVICE\n   Maintenance on B10 corridor\n   Affects: B10, B12\n\n⚠️ DETOUR\n   Construction near Calle 100\n   Affects: K86"
    }
  ],
  "_meta": {
    "ui": "ui://transmilenio-mcp/alerts?data=..."
  }
}
```

### UI Resource

The `_meta.ui` URL renders alert cards showing:
- Effect type with icon
- Cause (if known)
- Description
- Affected routes as badges
- Active period

---

## UI Resources

All tools can return `_meta.ui` with a `ui://` URL following the [MCP Apps standard](https://vercel.com/kb/guide/ai-sdk-mcp-apps).

The URL format:
```
ui://transmilenio-mcp/<type>?data=<encoded-json>
```

Types:
- `route-map` - Interactive route map
- `stops-map` - Stops on a map
- `arrivals` - Arrival board
- `alerts` - Service alerts

The data parameter contains URL-encoded JSON with all data needed to render the UI. This allows stateless rendering without additional API calls.

Hosts that support MCP Apps (like the Vercel AI SDK with MCP UI) will render these as interactive React components.
