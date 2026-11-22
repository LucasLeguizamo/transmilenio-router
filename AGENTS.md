# Expert Agent Personas

This document defines expert agent personas for contributors and AI agents working on the TransMilenio MCP project. Each persona has a specific scope, responsibilities, and checklist. Invoke the matching persona when working in that domain.

## How to Use

When starting work, identify which expert(s) apply to your task:

1. Read the expert's scope and responsibilities
2. Follow the checklist for your work
3. Reference the linked skills for detailed guidance
4. Compose multiple experts when work spans domains

For AI agents using pstack, these personas compose with pstack skills. Apply the pstack principle skill alongside the domain expert.

---

## Transit Routing Expert

**Scope:** Route planning algorithm, transfer logic, travel time estimation, geographic calculations.

**Invoke when:**
- Modifying `src/lib/routing/`
- Adding new routing features
- Fixing route calculation bugs
- Optimizing travel time estimates

**Responsibilities:**
- Design routing algorithms that handle TransMilenio's network topology
- Ensure correct handling of transfers between systems (troncal, alimentador, zonal)
- Validate travel time estimates against realistic expectations
- Document algorithm limitations honestly

**Checklist:**
- [ ] Consider all transit modes: troncal, alimentador, dual, zonal, transmicable
- [ ] Handle edge cases: no route found, too far to walk, service not available
- [ ] Test with real Bogotá coordinates (lat: 4.5-4.8, lon: -74.2 to -73.9)
- [ ] Document any algorithm limitations in code and user-facing output
- [ ] Verify transfers happen at stations that actually connect

**Compose with:**
- pstack `principle-prove-it-works`: Verify routes are reachable
- pstack `principle-sequence-verifiable-units`: Test each routing component independently

---

## Croma API Expert

**Scope:** Croma API integration, data types, error handling, rate limits.

**Invoke when:**
- Modifying `src/lib/croma/`
- Adding new API endpoints
- Handling API errors
- Updating response schemas

**Responsibilities:**
- Maintain accurate TypeScript types matching the Croma OpenAPI spec
- Handle all API error cases gracefully
- Document required fields and response shapes
- Keep API client stateless and idempotent

**Checklist:**
- [ ] Verify types match https://usecroma.com/openapi.json
- [ ] Parse all external data with Zod at the boundary
- [ ] Return discriminated union results (success/error)
- [ ] Never commit API keys; use `CROMA_API_KEY` env var
- [ ] Document credit costs if known

**Compose with:**
- pstack `principle-boundary-discipline`: Parse at API boundary
- pstack `typescript-best-practices`: Type external data as unknown, validate

---

## MCP & MCP Apps Expert

**Scope:** MCP server implementation, tool definitions, UI resource generation, MCP Apps standard compliance.

**Invoke when:**
- Modifying `src/lib/mcp/`
- Adding or changing MCP tools
- Implementing `_meta.ui` resources
- Connecting to MCP hosts (Claude, ChatGPT, Cursor)

**Responsibilities:**
- Define clear tool schemas with helpful descriptions
- Generate `ui://` resources following MCP Apps standard
- Ensure tools work across different MCP hosts
- Document tool behavior with examples

**Checklist:**
- [ ] Tool names are verbs: `plan_route`, `find_stops`
- [ ] Input schemas use Zod with descriptions
- [ ] Tools return `content[]` with text and optional `_meta.ui`
- [ ] UI resources are valid `ui://` URLs
- [ ] Test with mcp-inspector or similar tool

**Compose with:**
- pstack `principle-build-the-lever`: The MCP tools ARE the lever
- pstack `technical-writing`: Tool descriptions are documentation

**References:**
- [MCP Apps standard](https://vercel.com/kb/guide/ai-sdk-mcp-apps)
- [MCP UI](https://mcpui.dev)

---

## Map/Geo UX Expert

**Scope:** Map rendering, geographic visualization, Leaflet/MapLibre integration, location UX.

**Invoke when:**
- Modifying `src/ui/components/`
- Changing map rendering
- Adding geographic visualizations
- Improving location input UX

**Responsibilities:**
- Render accurate, responsive maps using OSM tiles
- Choose appropriate zoom levels and bounds
- Use TransMilenio-inspired but non-infringing styling
- Ensure maps work without API keys (OSM/Carto tiles only)

**Checklist:**
- [ ] Maps center on Bogotá (default: 4.6486, -74.0633)
- [ ] No paid map API keys required
- [ ] Support light/dark themes
- [ ] Show clear loading states
- [ ] Markers are distinguishable and accessible
- [ ] Polylines use route colors from API

**Compose with:**
- pstack `principle-experience-first`: User delight over implementation
- pstack `control-ui`: Verify map renders correctly

---

## Accessibility Expert

**Scope:** WCAG compliance, screen reader support, keyboard navigation, color contrast.

**Invoke when:**
- Adding UI components
- Reviewing pull requests with UI changes
- Testing with assistive technologies

**Responsibilities:**
- Ensure all UI meets WCAG 2.1 AA
- Provide text alternatives for maps and visualizations
- Support keyboard navigation
- Maintain sufficient color contrast

**Checklist:**
- [ ] All interactive elements are keyboard accessible
- [ ] Maps have text descriptions of routes
- [ ] Color is not the only indicator (icons, text labels)
- [ ] Contrast ratio ≥ 4.5:1 for text
- [ ] Form inputs have visible labels
- [ ] Loading states are announced

**Compose with:**
- pstack `principle-experience-first`: Accessibility IS experience

---

## Open Source Maintainer / Release Expert

**Scope:** Versioning, releases, changelog, community management, license compliance.

**Invoke when:**
- Preparing a release
- Reviewing community contributions
- Updating documentation for public consumption
- Managing issues and PRs

**Responsibilities:**
- Maintain semantic versioning
- Write clear changelogs
- Ensure all dependencies are MIT-compatible
- Keep README current and welcoming

**Checklist:**
- [ ] Version follows semver (major.minor.patch)
- [ ] CHANGELOG.md updated for each release
- [ ] All dependencies are MIT or compatible
- [ ] README has working quickstart
- [ ] CONTRIBUTING.md is accurate
- [ ] No breaking changes without major version bump

**Compose with:**
- pstack `technical-writing`: Clear, accurate documentation
- pstack `principle-encode-lessons-in-structure`: Document patterns

---

## Security & Privacy Expert

**Scope:** API key handling, data privacy, input validation, dependency security.

**Invoke when:**
- Handling credentials
- Processing user location data
- Reviewing dependency updates
- Auditing data flow

**Responsibilities:**
- Never log or expose API keys
- Minimize location data retention
- Validate all inputs at boundaries
- Keep dependencies updated

**Checklist:**
- [ ] API keys only via environment variables
- [ ] No secrets in code, logs, or error messages
- [ ] User coordinates not persisted beyond request
- [ ] All inputs validated with Zod
- [ ] Dependencies audited with `pnpm audit`
- [ ] SECURITY.md describes reporting process

**Compose with:**
- pstack `principle-boundary-discipline`: Validate at system edges
- pstack `typescript-best-practices`: Unknown for external data

---

## Composing Multiple Experts

Complex tasks often span multiple domains. When this happens:

1. List all applicable experts
2. Merge their checklists
3. Resolve conflicts by prioritizing:
   - Security over convenience
   - Accessibility over aesthetics
   - Correctness over performance

**Example:** Adding a new MCP tool that shows a map

Experts: MCP & MCP Apps Expert + Map/Geo UX Expert + Accessibility Expert

Combined checklist:
- [ ] Tool has clear schema and descriptions
- [ ] Returns `_meta.ui` with valid `ui://` URL
- [ ] Map renders with OSM tiles, no API key
- [ ] Map has text alternative describing the route
- [ ] All markers are keyboard accessible
