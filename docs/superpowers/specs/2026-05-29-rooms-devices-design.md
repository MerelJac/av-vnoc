# Rooms & Devices Pages — Design Spec

## Approved Design Decisions

### 1. Overall Layout: Split Tree + Detail

The Rooms page uses a two-panel layout:
- **Left panel (260px):** Customer → Site → Room tree with search. Each room shows a status dot (green/orange/red) and a device count. Collapsible at customer and site level.
- **Right panel (flex):** Detail view for the selected room — stat cards (online, offline, alerts, tickets), device table, and action buttons.

The Devices page is a separate, filterable flat inventory of all devices across all platforms.

### 2. Device Assignment: Both Directions

Users can assign a device to a room from two entry points — the choice is surfaced wherever relevant:
- **From the Room detail panel:** "+ Assign Device" button opens a modal showing all unassigned devices (searchable). Each row shows the vendor-side room hint if one exists.
- **From the Devices table row:** An "Assign" button on each unassigned device row opens a room picker (typeahead over Customer → Site → Room).

Both entry points call `PUT /api/devices/[id]` with `{ roomId }`. Unassigning calls the same endpoint with `{ roomId: null }`.

### 3. Room Creation: Smart Suggestions + Manual

Rooms are created manually via a "+ New Room" modal on the Rooms page. Additionally, when a device is unassigned but carries a vendor-side room name in its rawPayload (e.g. Poly Lens stores `room { id name }` on each device), the room detail shows a suggestion banner: "Poly Lens reports this device is in 'Conference A' — create that room and assign?" Users can accept (creates room + assigns), rename, or dismiss.

Manual "+ New Room" is always available from the tree panel footer or page header.

### 4. UI Design System Elements

The following components are introduced and should also be applied to existing pages:
- **`StatusDot`** — colored circle for online/offline/warn/unknown device or room status
- **`PlatformPill`** — small colored badge for POLY_LENS / YEALINK_YMCS / etc.
- **`StatCard`** — count + label card used in room detail header

These replace the ad-hoc inline pill styles currently in `AlertsTable.tsx`.

### 5. Data Model

No schema changes. `Device.roomId` is already nullable. `Device.rawPayload` (Json?) stores vendor data including any vendor-side room name. `Customer → Site → Room → Device` hierarchy is already in place.

## Pages

### Rooms Page (`/rooms`)
- Left: tree of all customers/sites/rooms with live status dots
- Right: selected room detail — stat strip, device table (name, platform, model, status, last seen, unassign action)
- Suggestion banner at top of detail when unassigned devices match the room name via vendor data
- "+ Assign Device" modal: searchable list of unassigned devices with vendor room hint
- "+ New Room" modal: name + optional floor/location note, under a selected site

### Devices Page (`/devices`)
- Filter bar: Customer, Platform, Status, Unassigned toggle
- Paginated table: Device name, Platform pill, Model, Room (or "⚠ unassigned"), Customer, Status dot, Last seen, Assign button
- Unassigned badge count at top when any devices lack a room

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/rooms` | Nested tree: customers → sites → rooms with device status counts |
| POST | `/api/rooms` | Create room (requires siteId + name) |
| GET | `/api/rooms/[id]` | Room detail with devices and suggestions |
| PUT | `/api/rooms/[id]` | Rename room / update floor |
| DELETE | `/api/rooms/[id]` | Delete room (devices become unassigned) |
| GET | `/api/devices` | List with filters: customerId, platform, status, unassigned |
| PUT | `/api/devices/[id]` | Update roomId (assign or unassign) |
