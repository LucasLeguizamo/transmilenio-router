# UI Guidelines

This document describes the design principles and implementation guidelines for UI components in the TransMilenio MCP project.

## Design Principles

### 1. TransMilenio-Inspired, Not Official

The UI uses colors and styling inspired by Bogotá's transit system but does not use official TransMilenio branding or logos.

**System colors:**
```typescript
const SYSTEM_COLORS = {
  troncal: "#E31937",        // Red - BRT trunk routes
  alimentador: "#00A651",     // Green - Feeders
  dual: "#F7941D",           // Orange - Dual routes
  zonal_urbano: "#0072BC",   // Blue - Urban buses
  zonal_complementario: "#662D91", // Purple
  zonal_especial: "#00AEEF", // Light blue
  transmicable: "#8DC63F",   // Lime - Cable car
};
```

### 2. No Paid API Keys

All map tiles come from free sources:
- Light theme: OpenStreetMap
- Dark theme: Carto basemaps

```typescript
const TILE_URLS = {
  light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
```

### 3. Responsive and Accessible

Components should:
- Work on mobile and desktop
- Support light and dark themes
- Provide text alternatives for visual content
- Be keyboard navigable

### 4. Clear Loading and Error States

Every component should handle:
- Loading state (skeleton or spinner)
- Empty state (no data)
- Error state (clear message, retry action)

## Components

### RouteMap

Interactive Leaflet map showing a route.

**Props:**
```typescript
type RouteMapProps = {
  plan: RoutePlan;
  theme?: "light" | "dark";
};
```

**Markers:**
- Origin: Green circle
- Destination: Red circle
- Board/alight: System badge (TM / S / A / C) colored by `system`, not raw GTFS color
- Transfers: Orange ⇄ marker (and dashed orange walk when hubs differ)

**Lines:**
- Transit: Solid, 5px, **system color** (so multimodal legs stay distinct)
- Walk: Dashed, 3px, gray
- Legend: lists each system used on the plan

**Bounds:** Auto-fit to show all markers with 50px padding.

**Multimodal preview:** `/preview/route-map` shows Calle 76 con Carrera 20 → Colina Campestre (SITP + TransMilenio). Screenshot: `docs/images/multimodal-route-map.png`.

### RouteDetails

Step-by-step route instructions.

**Layout:**
```
┌─────────────────────────────────────┐
│  25 min    │   5 min   │  0        │
│  Total     │  Walking  │ Transfers │
├─────────────────────────────────────┤
│ 1. 🚶 Walk                   ~3 min │
│    Walk 200m to Portal Norte       │
├─────────────────────────────────────┤
│ 2. 🚌 B10 TransMilenio      ~20 min│
│    Board at Portal Norte           │
│    5 stops                         │
│    Alight at Calle 26              │
├─────────────────────────────────────┤
│ 3. 🚶 Walk                   ~2 min │
│    Walk 150m to Museo Nacional     │
└─────────────────────────────────────┘
```

**Segment types:**
- Walk: Person icon, gray
- Transit: Bus icon, route badge with color
- Transfer: Arrow icon, orange

### StopsMap

Map showing multiple stops.

**Markers:**
- Stations: 14px circles
- Stops: 10px circles
- Color: Based on primary route system
- Search center: Blue circle (if proximity search)

**Popups:** Show stop name, ID, and routes on click.

### ArrivalsDisplay

Live arrival board.

**Layout:**
```
┌─────────────────────────────────────┐
│ Portal Norte                        │
│ ID: 10001        🟢 Live            │
├─────────────────────────────────────┤
│ ┌──────┐ Portal Sur        3 min   │
│ │ B10  │                           │
│ └──────┘ Predicted                 │
├─────────────────────────────────────┤
│ ┌──────┐ Portal 80         7 min   │
│ │ K86  │            +2 min late    │
│ └──────┘ Estimated                 │
└─────────────────────────────────────┘
```

**Route badge:** Colored by system, white text.

**Time display:**
- "Now" for 0 minutes
- "X min" for countdown
- Clock time for far future

**Delay:** Red for late, green for early.

### AlertsDisplay

Service alert cards.

**Layout:**
```
┌─────────────────────────────────────┐
│ ⚠️ REDUCED SERVICE   Technical Issue│
│                                     │
│ Maintenance on B10 corridor         │
│                                     │
│ Routes: B10 B12                     │
│ Until: Jan 20, 6:00 PM              │
│                                     │
│ More information →                  │
└─────────────────────────────────────┘
```

**Effect icons:**
- Detour: ↩️
- No Service: 🚫
- Reduced Service: ⚠️
- Delays: ⏰
- Stop Moved: 📍

**Colors:** Yellow/amber for warning appearance.

## Theming

### CSS Variables

Components use CSS variables for theming:

```css
--bg-primary: #ffffff;
--bg-secondary: #f3f4f6;
--text-primary: #111827;
--text-secondary: #6b7280;
--border-color: #e5e7eb;
```

### Host Theming

MCP Apps hosts can override these variables. The UI should work with any reasonable color scheme.

### Dark Mode

Pass `theme="dark"` to map components for dark tiles. Other components follow CSS variables.

## Implementation Notes

### Leaflet in React

Leaflet is controlled via refs, not React state:

```typescript
const mapRef = useRef<HTMLDivElement>(null);
const mapInstanceRef = useRef<L.Map | null>(null);

useEffect(() => {
  if (!mapRef.current || mapInstanceRef.current) return;
  
  const map = L.map(mapRef.current);
  mapInstanceRef.current = map;
  
  // ... setup
  
  return () => {
    map.remove();
    mapInstanceRef.current = null;
  };
}, [dependencies]);
```

### Styled JSX

Components use `styled-jsx` for scoped CSS:

```tsx
<div className="component">
  <style jsx>{`
    .component {
      /* styles */
    }
  `}</style>
</div>
```

### No External CSS Frameworks

Components should be self-contained without dependencies on external CSS frameworks.

## Accessibility

### Maps

- Provide text summary of route/stops in addition to map
- Markers have descriptive popups
- Support keyboard navigation (TODO)

### Arrivals and Alerts

- Color is never the only indicator
- Use icons alongside colors
- Text labels for all data

### Screen Readers

- Use semantic HTML
- ARIA labels where needed
- Announce dynamic updates (TODO)

## Testing

### Visual Testing

```bash
pnpm verify ui
```

Captures screenshots to `artifacts/`.

### Manual Testing

1. Run dev server: `pnpm dev`
2. Open `http://localhost:3000`
3. Test responsive layouts
4. Test light/dark themes
5. Test with keyboard only
