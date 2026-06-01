# Customer & Site Management — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorm)
**Author:** Alex Zawadzki

## Goal

Replace the placeholder `/customers` page with a working management surface for
**customers** and the **sites** that belong to them. This is the level of the
hierarchy the existing **Rooms** page does not manage (Rooms manages
rooms → devices within a site). Together they form the full
Customer → Site → Room → Device management story.

## Scope

- **Full CRUD** for customers and sites (create, edit, delete, view).
- **No schema changes** — existing `Customer` and `Site` models are sufficient.
- UI reuses the existing Rooms tree visual style (expandable Customer → Site tree).
- Access gate matches the current `/customers` page: `isSuperAdmin || MANAGER || TIER2`.
- Audit logging on every write via the existing `ActivityLog` model.

### Out of scope

- New customer/site fields (contact, timezone, account manager, etc.).
- Room/device management (already owned by the Rooms page).
- Bulk import/export.

## Data Model

No migration required.

```
Customer { id, name, createdAt, updatedAt }
Site     { id, customerId, name, address?, city?, state?, lat?, lng?, createdAt, updatedAt }
```

Cascade behavior (already defined in schema):
- Deleting a `Customer` cascades to its `Site`s → `Room`s → `Device`s
  (`onDelete: Cascade`), and nullifies related `AlertGroup` references.
- Deleting a `Site` cascades to its `Room`s → `Device`s.

## API Routes (new)

All responses use the standard envelope: `{ success: true, data }` or
`{ error: string }`. All routes call `getServerSession`; **write** operations
additionally require `isSuperAdmin || vnocRole === "MANAGER" || vnocRole === "TIER2"`
and return `403` otherwise. All request bodies are validated with **Zod**.
Handlers wrap work in `try/catch`, log context server-side with `console.error`,
and return friendly messages.

| Route | Method | Purpose |
|---|---|---|
| `/api/customers` | `GET` | List customers, each with nested sites and a per-site room count |
| `/api/customers` | `POST` | Create a customer (`{ name }`) |
| `/api/customers/[id]` | `PATCH` | Rename a customer (`{ name }`) |
| `/api/customers/[id]` | `DELETE` | Delete a customer (cascades) |
| `/api/sites` | `POST` | Create a site (`{ customerId, name, address?, city?, state?, lat?, lng? }`) |
| `/api/sites/[id]` | `PATCH` | Edit any site field |
| `/api/sites/[id]` | `DELETE` | Delete a site (cascades) |

### GET `/api/customers` shape

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…",
      "name": "Acme Corp",
      "sites": [
        { "id": "…", "name": "HQ", "address": "…", "city": "NYC",
          "state": "NY", "lat": null, "lng": null, "roomCount": 4 }
      ]
    }
  ]
}
```

`roomCount` is a cheap derived value via Prisma `_count: { select: { rooms: true } }`
— no schema change, used for navigation context on site rows.

### DELETE cascade counts

Before deleting, the `DELETE` handlers compute what will be removed
(sites / rooms / devices counts) and return them so the UI can confirm. The
confirm modal also fetches/uses these counts. Counts are recomputed server-side
at delete time; the modal display is advisory.

### Zod schemas

- `customerCreateSchema = { name: string().trim().min(1).max(120) }`
- `customerUpdateSchema = { name: string().trim().min(1).max(120) }`
- `siteCreateSchema = { customerId: string().uuid(), name: min(1).max(120),
  address?/city?/state?: string().max(…).optional(), lat?/lng?: number().optional() }`
- `siteUpdateSchema = siteCreateSchema without customerId, all fields optional but
  at least one present`

Shared in `src/lib/customer-site-schemas.ts` (mirrors the small-files convention).

## Audit Logging

Each successful write creates an `ActivityLog` row (same pattern as
`tickets/[id]/actions` and `correlation.ts`):

| Action | `type` | `message` | `meta` |
|---|---|---|---|
| Create customer | `customer_created` | `Customer "<name>" created` | `{ customerId }` |
| Rename customer | `customer_updated` | `Customer renamed to "<name>"` | `{ customerId }` |
| Delete customer | `customer_deleted` | `Customer "<name>" deleted (N sites, M rooms, K devices)` | `{ customerId, counts }` |
| Create site | `site_created` | `Site "<name>" added to <customer>` | `{ siteId, customerId }` |
| Edit site | `site_updated` | `Site "<name>" updated` | `{ siteId }` |
| Delete site | `site_deleted` | `Site "<name>" deleted (M rooms, K devices)` | `{ siteId, counts }` |

All entries set `userId: session.user.id`. Logging failures must not break the
primary operation but must be logged server-side.

## UI — `src/app/(app)/customers/`

Structure mirrors `src/app/(app)/rooms/` (many small, focused files).

| File | Responsibility |
|---|---|
| `page.tsx` | Server component. Role gate → redirect. Fetch customers + sites (+room counts). Render `CustomersClient`. |
| `CustomersClient.tsx` | Client state container. Holds customer list, handles refetch, opens modals. Immutable state updates (new objects, never mutate). |
| `CustomersTree.tsx` | Expandable Customer → Site tree, styled like `RoomsTree`. |
| `CustomerModal.tsx` | Add/edit customer (single modal, mode by presence of `customer`). |
| `SiteModal.tsx` | Add/edit site with all fields. |
| `ConfirmDeleteModal.tsx` | Generic confirm with cascade-count warning. |
| `types.ts` | Shared client types (`CustomerNode`, `SiteNode`). |

### Tree behavior

- **Customer row**: chevron (expand/collapse), name, site count, `[+ Add site]`,
  edit (pencil), delete (trash). Header has a global `[+ Add customer]`.
- **Site row** (nested): name, `city, state` (muted), `N rooms`, a link to the
  Rooms page filtered/scrolled to that site, edit, delete.
- Empty states: "No customers yet" / "No sites yet" with a prompt to add.
- Search box filters customers (and matching sites) client-side, like Rooms.

### State flow

1. Server renders initial tree from `page.tsx`.
2. Mutations call the API; on success, `CustomersClient` updates local state
   immutably (or refetches `/api/customers`) — never mutates existing nodes.
3. On error, surface an inline/toast message and leave state unchanged.

## Error Handling

- **Boundary validation**: Zod on all request bodies; `400` with field message
  on failure.
- **Auth**: `401` unauthenticated, `403` unauthorized writes.
- **Not found**: `404` when a customer/site id does not exist.
- **Server**: `try/catch`, `console.error` with context, generic `500` message
  to the client (no leakage).
- **Client**: friendly inline/toast messages; never silently swallow.

## Testing

Target **80%+ coverage** on new code.

### Unit (Vitest, mocked Prisma — follows `src/test/` patterns)
- Zod schemas: valid/invalid inputs, trimming, length bounds.
- `/api/customers` GET: auth gate, shape incl. `roomCount`.
- `/api/customers` POST + `[id]` PATCH/DELETE: auth gate, role gate (403),
  validation (400), success (201/200), cascade-count computation, audit-log write.
- `/api/sites` POST + `[id]` PATCH/DELETE: same matrix.

### E2E (Playwright)
- Critical flow: log in → Customers → add customer → add site → edit site →
  delete site (confirm) → delete customer (confirm with cascade warning).
- Assert tree reflects each change and audit entries are created.

## Implementation Order (for the plan)

1. Zod schemas (`customer-site-schemas.ts`) + unit tests.
2. API routes (customers, sites) + audit logging + unit tests.
3. Client types + `page.tsx` server fetch.
4. `CustomersTree` + `CustomersClient`.
5. Modals (`CustomerModal`, `SiteModal`, `ConfirmDeleteModal`).
6. Wire site → Rooms navigation.
7. E2E flow + coverage check.
