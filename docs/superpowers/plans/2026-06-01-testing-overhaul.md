# Testing Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the test suite rock-solid for both daily dev and final release by (1) adding integration tests for every currently-untested API route and (2) expanding Playwright E2E coverage to all critical user journeys.

**Scope (per product decision):** Cover untested API routes + expand E2E flows. Coverage thresholds stay at their current values (80/68/80/80) and the test harness is left as-is — this plan fills *behavioral* gaps, not tooling.

**Architecture:** Reuse the established Vitest unit/integration pattern (`vi.mock("next-auth")` + `vi.mock("@/lib/prisma")`, the `{ success, data }` envelope assertions) for routes, and the existing Playwright setup (login helper, seeded super-admin, `domcontentloaded` waits) for E2E. CI already runs `npm run coverage` + `npm run test:e2e`.

**Tech Stack:** Vitest, Playwright, Prisma (seeded Postgres in CI).

---

## Coverage Gap Analysis

**API routes WITH tests:** customers, customers/[id], sites, sites/[id], devices, devices/[id], rooms, rooms/[id], integrations (main), webhooks/yealink, dashboard/kpis, tickets/[id]/actions, auth (authorize).

**API routes WITHOUT tests (this plan adds them):**
| Route | Methods | Notes |
|---|---|---|
| `/api/alerts` | GET | severity/status filters, pagination, auth |
| `/api/activity` | GET | recent activity list, auth |
| `/api/tickets` | GET | queue + `?mine=true`, auth |
| `/api/tickets/[id]` | GET | detail + actions timeline, 404 |
| `/api/profile` | GET/PUT | own-profile read/update, validation |
| `/api/users` | GET/POST | list; invite creation, dup/role validation |
| `/api/users/[id]` | PUT/DELETE/PATCH | edit, remove, deactivate, self-guards |
| `/api/users/[id]/permissions` | PATCH | role/super-admin (see settings-admin plan) |
| `/api/invites` | GET/POST | create invite, expiry |
| `/api/invites/accept` | POST | token redemption, INVITE_PASS |
| `/api/invites/[id]` | DELETE | revoke |
| `/api/auth/forgot-password` | POST | token issue, no user-enumeration |
| `/api/auth/reset-password` | POST | token validation, expiry, password set |
| `/api/cron/daily` | GET/POST | `CRON_SECRET` bearer auth, sweep |
| `/api/cron/monthly` | GET/POST | bearer auth |
| `/api/cron/alerts` | GET/POST | bearer auth, poll |
| `/api/integrations/sync` | POST | triggers `syncAllDevices`, auth |
| `/api/sse/alerts` | GET | stream init + auth (smoke-level) |

**E2E journeys WITH coverage:** customer/site CRUD; all-routes smoke.
**E2E journeys to add:** login/logout, invite-accept onboarding, alert→ticket→actions, integrations credential save, rooms create + device assign.

---

## Shared Test Template

Every API route test follows this header (adjust the mocked Prisma models per route):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { /* only the models the route touches, each method = vi.fn() */ },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
const mockSession = vi.mocked(getServerSession);
beforeEach(() => vi.resetAllMocks());
```

Standard assertions per route: **401 unauthenticated**, **403 unauthorized** (where role-gated), **400 invalid input**, **404 missing**, and **2xx happy path with the expected envelope**. Read the route first; assert its real branches (don't assume).

---

## Phase 1 — API route integration tests

### Task 1: `/api/alerts` + `/api/activity`
**Files:** Create `src/test/api/alerts.test.ts`, `src/test/api/activity.test.ts`.

- [ ] **Step 1** Read `src/app/api/alerts/route.ts` and `src/app/api/activity/route.ts`.
- [ ] **Step 2: Write tests** — full example for alerts:
```typescript
// src/test/api/alerts.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/alerts/route";
import { NextRequest } from "next/server";
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { alert: { findMany: vi.fn(), count: vi.fn() } } }));
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
const mockSession = vi.mocked(getServerSession);
const mockFind = vi.mocked(prisma.alert.findMany);
const mockCount = vi.mocked(prisma.alert.count);
beforeEach(() => vi.resetAllMocks());

it("401 when unauthenticated", async () => {
  mockSession.mockResolvedValueOnce(null);
  expect((await GET(new NextRequest("http://localhost/api/alerts"))).status).toBe(401);
});
it("returns paginated alerts honoring severity/status filters", async () => {
  mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
  mockFind.mockResolvedValueOnce([{ id: "a1", severity: "CRITICAL", status: "ACTIVE" }] as never);
  mockCount.mockResolvedValueOnce(1);
  const res = await GET(new NextRequest("http://localhost/api/alerts?severity=CRITICAL&status=ACTIVE&page=1"));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.data[0].id).toBe("a1");
  // assert the where-clause filter was applied
  expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ severity: "CRITICAL", status: "ACTIVE" }),
  }));
});
```
For activity: 401 + returns recent list (mock the helper or `prisma.activityLog.findMany` as the route uses).
- [ ] **Step 3** Run `npx vitest run src/test/api/alerts.test.ts src/test/api/activity.test.ts` → PASS.
- [ ] **Step 4** Commit `test: cover /api/alerts and /api/activity`.

### Task 2: `/api/tickets` + `/api/tickets/[id]`
**Files:** Create `src/test/api/tickets.test.ts`.
- [ ] Read both routes. Assert: 401; GET queue returns tickets; `?mine=true` adds `assignedTo: session.user.id` to the where clause; `[id]` GET returns detail with actions; `[id]` 404 when missing. Run → PASS. Commit `test: cover /api/tickets list + detail`.

### Task 3: `/api/profile`
**Files:** Create `src/test/api/profile.test.ts`.
- [ ] Read route. Assert: 401; GET returns the session user's profile; PUT validates (e.g. required names) → 400 on bad input, 200 + persists on valid; confirms it only writes the caller's own profile. Run → PASS. Commit `test: cover /api/profile`.

### Task 4: `/api/users` + `/api/users/[id]`
**Files:** Create `src/test/api/users.test.ts`.
- [ ] Read routes. Assert: GET list (auth); POST invite — 403 for non-super-admin, 400 on duplicate/invalid email/role, success creates `Invite` + sends email (mock `@/lib/email-templates/welcomeEmail` / `sendEmail`); `[id]` PUT edits; DELETE removes with self-guard (cannot delete self). Run → PASS. Commit `test: cover /api/users + [id]`.

> `[id]/permissions` PATCH tests are authored in the settings-admin plan (Task 7) once that handler exists. If implementing this plan first, add a placeholder test asserting the current behavior, then update when permissions lands.

### Task 5: Invite lifecycle — `/api/invites`, `/api/invites/accept`, `/api/invites/[id]`
**Files:** Create `src/test/api/invites.test.ts`.
- [ ] Read all three. Assert: create invite (super-admin only, expiry set); `accept` — invalid/expired token → 400/404, valid token + correct `INVITE_PASS` creates the user/profile and marks accepted, wrong pass rejected; `[id]` DELETE revokes (super-admin only). Mock `prisma.invite`/`prisma.user`/`prisma.profile` and `process.env.INVITE_PASS`. Run → PASS. Commit `test: cover invite lifecycle`.

### Task 6: Password reset — `/api/auth/forgot-password` + `/api/auth/reset-password`
**Files:** Create `src/test/api/password-reset.test.ts`.
- [ ] Read both. Assert: forgot-password returns **200 even for unknown email** (no user enumeration) and only creates a `PasswordResetToken` + sends mail when the user exists (mock `forgotPassword`/`sendEmail`); reset-password rejects invalid/expired tokens (400), and on a valid token hashes + sets the new password and consumes the token. Run → PASS. Commit `test: cover password reset flows`.

### Task 7: Cron auth — `/api/cron/daily`, `/api/cron/monthly`, `/api/cron/alerts`
**Files:** Create `src/test/api/cron.test.ts`.
- [ ] Read routes. For each: **401/403 without `Authorization: Bearer <CRON_SECRET>`**, and success path when the header matches (mock the work functions — `syncAllDevices`, auto-resolve sweep — and `process.env.CRON_SECRET`). Example:
```typescript
import { POST } from "@/app/api/cron/daily/route";
// mock the sweep/poll deps; set process.env.CRON_SECRET = "secret"
it("rejects without bearer token", async () => {
  const res = await POST(new NextRequest("http://localhost/api/cron/daily", { method: "POST" }));
  expect([401, 403]).toContain(res.status);
});
it("runs with valid bearer token", async () => {
  const res = await POST(new NextRequest("http://localhost/api/cron/daily", {
    method: "POST", headers: { Authorization: "Bearer secret" },
  }));
  expect(res.status).toBe(200);
});
```
Run → PASS. Commit `test: cover cron endpoint auth + dispatch`.

### Task 8: `/api/integrations/sync` + `/api/sse/alerts` (smoke)
**Files:** Create `src/test/api/integrations-sync.test.ts`, `src/test/api/sse-alerts.test.ts`.
- [ ] integrations/sync: 401 unauth; authorized POST calls `syncAllDevices` (mocked) and returns its `{ synced, errors }`.
- [ ] sse/alerts: 401 unauth; authorized GET returns a `text/event-stream` response (assert status 200 + `Content-Type` header; do not consume the stream). Run → PASS. Commit `test: cover integrations sync + sse auth`.

---

## Phase 2 — E2E journeys

All specs go in `tests/e2e/`, reuse the `login()` helper pattern from `customer-site-management.spec.ts`, and use `waitUntil: "domcontentloaded"` (the dashboard holds an open SSE connection, so `networkidle` never settles). Tests must self-clean or use timestamped unique data.

### Task 9: Auth journey
**Files:** Create `tests/e2e/auth.spec.ts`.
- [ ] Login with valid creds → lands on `/dashboard`; invalid creds → "Invalid email or password" shown, stays on `/login`; logout returns to `/login`; visiting an `(app)` route while logged out redirects to `/login`. Run `npx playwright test tests/e2e/auth.spec.ts` (dev server up) → PASS. Commit.

### Task 10: Alert → ticket → actions journey
**Files:** Create `tests/e2e/ticket-flow.spec.ts`.
- [ ] Seed/create an alert (via webhook POST or a seeded fixture), open `/alerts`, verify it appears; open `/tickets`, open a ticket detail, add an action, assert the action shows in the timeline and status updates. (If manual ticket creation doesn't exist yet, drive the correlation-created ticket from a seeded alert.) Run → PASS. Commit.

### Task 11: Integrations setup journey
**Files:** Create `tests/e2e/integrations.spec.ts`.
- [ ] As super-admin, open settings → integrations, enter Poly (or Yealink) credentials, save, reload, assert the saved (non-secret) fields persist and secrets are not echoed back. Run → PASS. Commit.

### Task 12: Rooms + device assignment journey
**Files:** Create `tests/e2e/rooms.spec.ts`.
- [ ] Open `/rooms`, add a room under a seeded site, open the room, assign an unassigned device (or assert the empty/suggestions state), verify counts update. Run → PASS. Commit.

### Task 13: Invite-accept onboarding journey
**Files:** Create `tests/e2e/invite.spec.ts`.
- [ ] As super-admin, create an invite for a fresh email; read the token (from the API response or DB query in the test setup); visit `/invite/[token]`, complete acceptance with `INVITE_PASS`; assert the new user can then log in. Run → PASS. Commit.

---

## Phase 3 — Verification
- [ ] `npx vitest run` → all unit/integration pass; **no untested route remains** in the gap table.
- [ ] `npm run coverage` → thresholds (80/68/80/80) still met or exceeded.
- [ ] `npx playwright test` (dev server up) → all E2E specs green.
- [ ] `npm run lint` → 0 errors; `npx tsc --noEmit` → clean.
- [ ] Confirm CI (`.github/workflows/ci.yml`) runs the expanded suites — both jobs green on a PR.

---

## Notes for "test during dev" ergonomics (no harness changes, just usage)
- Fast inner loop: `npx vitest` (watch) or `npx vitest run <path>` for a single file; `npx vitest run src/test/api` for all route tests.
- E2E against your already-running dev server: `npx playwright test <spec>` (config reuses the existing server).
- The smoke test (`tests/e2e/smoke-routes.spec.ts`) is the quickest "did I break a page" check.

## Dependency notes
- Task 4's `permissions` PATCH tests depend on the **settings-admin plan** (Task 7) implementing that handler. Sequence that plan first, or stub-test then upgrade.
- Tasks 10/11/13 assume seeded data (alerts, a site, the super-admin). Use the existing `prisma/seed.ts`; extend it only if a journey needs a fixture it doesn't already create.
