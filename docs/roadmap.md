# Roadmap

## Done (0.1.0)

- Croma API client with Zod boundary types
- Heuristic route planner (direct + one transfer)
- MCP tools: `plan_route`, `find_stops`, `stop_arrivals`, `service_alerts`
- Interactive UI components (Leaflet maps, arrivals, alerts)
- Verification CLI and feature map
- Demo host with Vercel AI SDK
- Open-source docs, CI, expert personas

## Next

### Routing

- Multi-transfer search with better pruning
- Rank candidate routes by estimated time
- Use live arrivals to adjust ETAs
- Optional Nominatim geocoding for free-text addresses

### MCP Apps

- Standalone HTML UI resources for hosts that do not mount React
- Stronger MCP-UI compatibility checks
- Resource caching for large route geometries

### Ops

- Rate-limit awareness and backoff for Croma
- Structured logging without leaking secrets
- Optional caching layer for stop/route static data

## Later

- Offline stop/route snapshot for degraded mode
- Metro de Bogotá proximity overlays via `/co/metro-bogota/proximity/v1`
- Multi-language UI (Spanish + English)
- Formal verification of planner invariants
