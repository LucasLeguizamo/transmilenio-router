# Architecture

This document describes the high-level architecture of the TransMilenio MCP project.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Client                                │
│         (Claude, ChatGPT, Cursor, Vercel AI SDK)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server                                 │
│                   (Next.js API Route)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      MCP Tools                           │  │
│  │  plan_route │ find_stops │ stop_arrivals │ service_alerts │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Route Planner                          │  │
│  │        (Heuristic routing using Croma data)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Croma Client                           │  │
│  │           (Typed API client with Zod parsing)            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Croma API                                  │
│                  (api.croma.run)                                │
│  TransMilenio: stops, routes, arrivals, alerts, vehicles        │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### MCP Server (`src/lib/mcp/`)

The MCP server exposes tools following the Model Context Protocol. It handles:

- Tool registration and discovery
- Request/response formatting
- UI resource generation via `_meta.ui`

**Key files:**
- `server.ts` - MCP server setup and handlers
- `tools.ts` - Tool implementations

### Route Planner (`src/lib/routing/`)

The route planner calculates transit routes using data from the Croma API. It uses a heuristic approach since Croma doesn't provide graph-based routing.

**Algorithm:**
1. Resolve origin/destination to coordinates
2. Find nearby stops within walking distance
3. Search for direct routes (shared route IDs)
4. If no direct route, search for transfer routes
5. Build route plan with segments, times, and alerts

**Key files:**
- `planner.ts` - Routing algorithm
- `types.ts` - Route plan types

### Croma Client (`src/lib/croma/`)

Type-safe client for the Croma API with Zod schema validation at the boundary.

**Endpoints used:**
- `POST /co/transmilenio/stops-search/v1`
- `POST /co/transmilenio/stop/v1`
- `POST /co/transmilenio/routes-search/v1`
- `POST /co/transmilenio/route/v1`
- `POST /co/transmilenio/stop-arrivals/v1`
- `POST /co/transmilenio/alerts/v1`

**Key files:**
- `client.ts` - API client class
- `types.ts` - Zod schemas matching OpenAPI spec

### UI Components (`src/ui/`)

React components for rendering route maps, stop lists, and arrival boards. Designed to work with MCP Apps hosts.

**Key components:**
- `RouteMap` - Interactive Leaflet map with route polyline
- `RouteDetails` - Step-by-step route instructions
- `StopsMap` - Map showing multiple stops
- `ArrivalsDisplay` - Live arrival board
- `AlertsDisplay` - Service alert cards

## Data Flow

### Tool Call Flow

```
1. AI client calls MCP tool (e.g., plan_route). Routing uses the local network snapshot when fresh (`pnpm network:sync`); Croma is used for live arrivals/alerts and as fallback if the snapshot is missing/stale. See [network-sync.md](./network-sync.md).
2. MCP server receives request
3. Tool parses input with Zod schema
4. Route planner queries Croma API
5. Planner builds route plan
6. Tool formats response with text and UI URL
7. MCP server returns response
8. AI client displays text and renders UI
```

### UI Resource Flow

```
1. Tool returns _meta.ui with ui:// URL
2. UI URL contains encoded JSON data
3. MCP Apps host reads resource
4. Host renders React component with data
5. User sees interactive map/display
```

## Design Decisions

### Why Heuristic Routing?

The Croma API provides stop, route, and schedule data but not a routing endpoint. Building full graph-based routing would require:

- Complete stop-to-stop travel times
- Transfer penalties
- Real-time service adjustments

Instead, we use a simpler approach:
1. Find stops near origin and destination
2. Look for routes that serve both
3. If none, find a transfer point

This works for many common trips but may miss optimal routes.

### Why Zod at the Boundary?

External API data is `unknown` until validated. Zod provides:

- Runtime type checking
- Clear error messages
- Automatic TypeScript types via inference

All Croma responses are parsed through Zod schemas before use.

### Why Leaflet?

Leaflet is chosen because:
- No API key required (uses OSM tiles)
- Mature, well-documented
- Works in React via refs
- Lightweight

## Deployment

The project is designed for Vercel deployment:

- Next.js App Router
- API routes for MCP endpoint
- Edge-compatible (Node.js runtime for API)
- Environment variables for secrets

## Testing Strategy

### Unit Tests

- Routing algorithm with mock Croma responses
- Zod schema validation
- Tool input parsing

### Integration Tests

- MCP tool calls with fixtures
- Croma client with mocked HTTP

### UI Tests

- Component rendering with Playwright
- Screenshot comparisons

### Live Tests

- Full flow with real Croma API
- Requires `CROMA_API_KEY`
