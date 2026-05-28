# VNOC UI Redesign — Match Mockup

**Date:** 2026-05-28  
**Scope:** Full app shell (all pages) + dashboard page content panels  
**Reference:** `docs/CallOne_VNOC_Proposal.docx` → image3.png  

---

## Goal

Restyle the VNOC web app to match the `CallOne_VNOC_Proposal.docx` dashboard mockup exactly. This covers the global layout shell (top nav + sidebar) and the dashboard page panels. Other pages (alerts, tickets, rooms, devices, customers) inherit the new shell but retain their existing content layout for now.

---

## Approach: Hybrid Restyle

Split the current monolithic `Sidebar.tsx` into two presentational components (`TopNav.tsx`, `AppSidebar.tsx`). Restyle all dashboard panels in-place. Add two new placeholder panels. No routing or data-fetching logic changes.

---

## Shell — Applied to Every Authenticated Page

### TopNav (`src/app/components/team/TopNav.tsx`)

- Full-width dark navy bar, height 52px, `background: #0f1347`, `z-index: 40`, `position: sticky top-0`
- **Left:** "Call One VNOC" wordmark — "Call One" in white semibold, "VNOC" in `#90d5ff` bold, small `font-orbitron`
- **Center:** Horizontal nav links — Overview (`/dashboard`), Alerts (`/alerts`), Tickets (`/tickets`), Rooms (`/rooms`), Devices (`/devices`), Customers (`/customers`), Reports (disabled/greyed, no page yet)
  - Active link: white text + bottom border `#90d5ff`
  - Inactive: `#8892b0` text, hover → white
  - Reports: `#4a5568` text, cursor-default, no hover
- **Right:** User avatar circle (32px, `bg-[#1e2a6e]`, initials in `#90d5ff`, `font-orbitron text-xs`)
- Mobile: hide center nav links below `md:`, show hamburger icon that opens sidebar

### AppSidebar (`src/app/components/team/AppSidebar.tsx`)

- Width: 220px, `background: #0a0e2e`, full height below top nav, `border-r border-[#1e2a6e]`
- Text color: `#c8d0e0`; section labels: `#4a5568` uppercase 10px tracking-widest
- Active nav item: `background: rgba(144,213,255,0.1)`, `border-l-2 border-[#90d5ff]`, text white
- Hover: `background: rgba(255,255,255,0.05)`

**Section 1 — Live Operations**
- My Queue → `/tickets?queue=mine` (badge: count of tickets assigned to current user with status OPEN/IN_PROGRESS)
- All Alerts → `/alerts`
- All Tickets → `/tickets`
- Sites → `/sites` (placeholder, no page yet — greyed)
- Rooms → `/rooms`
- Devices → `/devices`

**Section 2 — Customers**
- Fetched server-side: top 5 customers by name, each links to `/customers?id=X`
- If more than 5 exist: show "+N more" link → `/customers`
- Customer names truncated at 18 chars with ellipsis

**Section 3 — Data Sources**
- Static list: Poly Lens, Yealink YMCS, Neat Pulse, Logitech Sync, Cisco Control Hub, ServiceNow, Utelogy
- Each has a green dot (`bg-green-400`) — hardcoded healthy for now
- Radio icon on left (4px, muted)

**Bottom of sidebar (below divider):**
- Profile link → `/profile`
- Logout button

### Layout Wrapper (`src/app/(app)/layout.tsx`)

Updated to compose `<TopNav>` + `<div className="flex">` + `<AppSidebar>` + `<main>`. Main content: `flex-1 overflow-y-auto bg-[#f0f2f8] p-6`.

The sidebar receives customer list as a prop (fetched in the layout server component alongside the session check).

---

## Dashboard Page Panels

### KPI Strip — 5 Cards (`KpiStrip.tsx`)

Cards rendered in a single horizontal row (`grid-cols-5`), white background, subtle shadow, rounded-xl border border-gray-100.

| # | Card | Primary value | Sub-line |
|---|---|---|---|
| 1 | Critical Alerts | Integer count (large, red if >0) | Row of severity dot-badges: N● red (CRITICAL), N● orange (HIGH), N● yellow (MEDIUM) |
| 2 | Open Tickets | Integer count (large) | "N breaching SLA" in orange if >0, else "All on track" in green |
| 3 | Rooms Online | Percentage string e.g. "96.3%" | "412 / 428 rooms" below |
| 4 | MTTR (24h) | "42m" (minutes) | Mini horizontal bar placeholder (no real sparkline library) |
| 5 | SLA Compliance (30d) | Percentage string e.g. "98.4%" | Thin green progress bar (width = % value) |

**New DB queries needed in `dashboard/page.tsx`:**
- `devicesOnline` / `devicesTotal` already fetched → derive rooms online from `Room` model: `prisma.room.count()` total, `prisma.room.count({ where: { devices: { some: { status: 'online' } } } })` online
- MTTR: average `resolvedAt - openedAt` for tickets resolved in last 24h (raw query or Prisma aggregate)
- SLA Compliance 30d: `(ticketsClosedOnTime / totalTicketsClosed) * 100` over last 30 days. `onTime` = `resolvedAt <= slaDeadline`
- Severity breakdown: `prisma.alert.groupBy({ by: ['severity'], where: { status: 'ACTIVE' }, _count: true })`

KpiStrip receives expanded `initial` prop with new fields; SSE refresh calls `/api/dashboard/kpis` which also returns expanded data.

### Live Alerts Panel (`AlertsFeed.tsx`)

Replaces simple list with a styled table (no `<table>` element — use flex rows for alignment).

Each row:
- Left: 4px color bar (`bg-red-500` CRITICAL, `bg-orange-400` HIGH, `bg-yellow-400` MEDIUM, `bg-blue-400` LOW)
- Column 1 (flex-1): Customer/room name in semibold + device name in muted small below
- Column 2: Platform badge pill — colored by platform:
  - POLY_LENS → `bg-orange-100 text-orange-700`
  - YEALINK_YMCS → `bg-purple-100 text-purple-700`
  - NEAT_PULSE → `bg-green-100 text-green-700`
  - default → `bg-gray-100 text-gray-600`
- Column 3: Action button — if unassigned show "Assign" (blue outline button), if assigned show "Review" (gray outline)
- Row height ~44px, hover `bg-gray-50`, `border-b border-gray-100`

Header: "Live Alerts" with red AlertTriangle icon + "View all →" link to `/alerts` right-aligned.

The `Alert` interface gains `customer?: { name: string }` by adding `include: { device: { include: { room: { include: { site: { include: { customer: true } } } } } } }` to the query in `dashboard/page.tsx`.

### My Open Tickets Panel (`TicketsFeed.tsx`)

Header: "My Open Tickets — ServiceNow" + "View all →" link.

Each row:
- INC number: formatted as `INC${ticket.id.slice(-7).toUpperCase()}` in `font-mono text-xs text-gray-500` (no serviceNowId field in schema; use last 7 chars of UUID)
- Main text: ticket title truncated, customer name below in muted
- Priority badge: `P1` red, `P2` orange, `P3` yellow, `P4` gray
- SLA countdown: time remaining formatted as "Xh Ym" — red if <2h, orange if <4h, green otherwise

### VNOC Activity Feed (`ActivityFeed.tsx`)

Each log entry gets a source-type pill derived from `log.type`:
- `POLY_LENS` / `alert_created` → `bg-blue-100 text-blue-700` "Poly Lens"
- `TICKET_*` / `ticket_opened` → `bg-green-100 text-green-700` "ServiceNow"
- `NEAT_PULSE` → `bg-teal-100 text-teal-700` "Neat Pulse"
- `SYSTEM` / default → `bg-gray-100 text-gray-600` "System"

Layout per row: pill (fixed width ~90px) + message text + timestamp right-aligned in muted.

### Customer Site Map (`CustomerSiteMap.tsx`) — New Component

Placeholder card (bottom-right top half):
- Header: "Customer Site Map" + "32 sites · 428 rooms" counts
- Body: light gray `bg-[#e8ecf4]` rectangle, height ~160px, with 5–6 colored circles (SVG) positioned at approximate US city coordinates, sized by alert count
- Data: fetch `prisma.customer.findMany({ include: { _count: { select: { sites: true } }, sites: { include: { _count: { select: { rooms: true } } } } } })` — static server render, no SSE
- Each customer circle: positioned using `site.lat` / `site.lng` mapped to SVG viewBox (US bounds ~lat 25–50, lng -125 to -65); multiple sites per customer merge to centroid. Fall back to deterministic position from customer.id hash if no lat/lng.
- No real map library; pure SVG placeholder

### Room Control — Utelogy (`RoomControl.tsx`) — New Component

Placeholder card (bottom-right bottom half):
- Header: "Room Control — Utelogy"
- Dropdown: "Select a room" → populates from `prisma.room.findMany({ take: 20, include: { devices: true } })`
- On select: shows device list with name + status dot (green = online, red = offline)
- No real Utelogy API integration — reads from local DB status only
- "Open Ticket" button (greyed, no-op) + "Refresh Devices" button (refetches same room)

---

## Files Changed / Created

| File | Change |
|---|---|
| `src/app/components/team/TopNav.tsx` | **New** |
| `src/app/components/team/AppSidebar.tsx` | **New** (replaces Sidebar.tsx logic) |
| `src/app/components/team/Sidebar.tsx` | **Replace** body — now just re-exports the new layout composition |
| `src/app/(app)/layout.tsx` | Fetch customers, pass to AppSidebar; compose TopNav + AppSidebar |
| `src/app/(app)/dashboard/page.tsx` | Add MTTR, SLA compliance, severity breakdown, customer-in-alert queries |
| `src/app/(app)/dashboard/KpiStrip.tsx` | Expanded props + new card designs |
| `src/app/(app)/dashboard/AlertsFeed.tsx` | Restyle to table rows with color bar + platform badge + action button |
| `src/app/(app)/dashboard/TicketsFeed.tsx` | Restyle with INC format + SLA countdown |
| `src/app/(app)/dashboard/ActivityFeed.tsx` | Add colored source-type pill per entry |
| `src/app/(app)/dashboard/CustomerSiteMap.tsx` | **New** — SVG bubble placeholder |
| `src/app/(app)/dashboard/RoomControl.tsx` | **New** — room selector + device list |
| `src/app/api/dashboard/kpis/route.ts` | Return expanded KPI data (severity breakdown, MTTR, SLA %) |

---

## Non-Goals

- Real map library (Mapbox, Leaflet) — SVG placeholder only
- Real Utelogy API integration — DB status only
- Redesigning alerts/tickets/rooms/devices/customers page content — shell only
- Dark mode

---

## Success Criteria

1. App shell (top nav + sidebar) matches mockup color scheme and structure on every authenticated page
2. Dashboard KPI strip shows all 5 cards with correct data
3. Alerts panel shows severity color bar, platform badge, action button per row
4. Tickets panel shows INC format + SLA countdown
5. Activity feed shows colored source-type pills
6. Customer Site Map and Room Control placeholder panels render without errors
7. All existing SSE live-update behavior continues to work
