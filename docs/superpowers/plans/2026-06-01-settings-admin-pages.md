# Settings & Admin Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out the settings & admin area across four surfaces — Organization/general settings, SLA & alert-routing config, User & role management, and Integrations/platform credentials — on a consistent, validated, audited foundation.

**Architecture:** Introduce a single key-value `AppConfig` store (one row per config domain, JSON value) validated with Zod on write, so org/SLA/routing settings share one persistence pattern with no model sprawl. A tabbed `/settings` shell hosts the sections; `/users` (admin) gains real role assignment and deactivation. All writes are role-gated and audited via `ActivityLog`.

**Tech Stack:** Next.js 15 App Router, Prisma 7 (one migration for `AppConfig` + a `User.active` flag), NextAuth, Zod, Tailwind, Vitest.

**Builds on:** `canManageCustomers`-style access helpers, the `{ success, data }` API envelope, and the customer/site CRUD patterns already in the repo.

---

## Design

### Current state
- `/settings` renders `SettingsClient` (Poly + Yealink credential forms).
- `/settings/platform` is a **separate** page covering similar ground → **consolidate** into one tabbed settings shell.
- `/users` (admin) lists users + pending invites. `POST /api/users` invites; `PUT/DELETE /api/users/[id]` edit/remove; `PATCH /api/users/[id]/permissions` is a **stub** (no params, no body) → implement real `vnocRole`/super-admin assignment.
- No persistence exists for org-level, SLA, or routing settings.

### Settings storage — `AppConfig`
```prisma
model AppConfig {
  key       String   @id            // "org" | "sla" | "routing"
  value     Json
  updatedAt DateTime @updatedAt
}
```
A typed accessor (`getAppConfig`/`setAppConfig`) reads/writes one domain blob, each validated by a Zod schema. Single migration. Extensible (new domains = new key, no schema change).

### Access control
- Add `canManageSettings(session)` = super-admin **or** MANAGER (mirrors `canManageCustomers` in `src/lib/vnoc-access.ts`).
- User management (role/super-admin/deactivation) = **super-admin only** (matches the existing `(admin)/users` guard).

### Four sections (tabs under `/settings`)
1. **Organization** — name, timezone, business hours (start/end + days), support email. Stored under `AppConfig["org"]`.
2. **SLA & alert routing** — SLA minutes per `TicketPriority` (P1–P4), auto-resolve window (hours), alert-severity → priority mapping, optional escalation note. Stored under `AppConfig["sla"]` and `AppConfig["routing"]`. **Wires into real behavior**: ticket SLA deadline computation and the auto-resolve cron read these values (replacing hardcoded constants).
3. **Users & roles** (links to `/users`) — assign `VnocRole`, toggle super-admin, deactivate/reactivate.
4. **Integrations** — the existing platform-credential forms (Poly, Yealink, + Logitech from the Logi plan), moved into this shell; `/settings/platform` redirects here.

### Audit
Every settings write and every user role/status change creates an `ActivityLog` row (`type: "settings_updated"` / `"user_role_changed"` / `"user_deactivated"`, with `userId` + `meta`).

---

## Phase 1 — Settings storage foundation

### Task 1: `AppConfig` model + migration
**Files:** Modify `prisma/schema.prisma`; run migration.

- [ ] **Step 1** Add the `AppConfig` model (above) to `prisma/schema.prisma`.
- [ ] **Step 2** Add an `active Boolean @default(true)` field to `User` (for deactivation in Phase 3).
- [ ] **Step 3** Run: `npx prisma migrate dev --name app_config_and_user_active`
  Expected: migration created + applied; client regenerated.
- [ ] **Step 4** Run: `npx prisma generate`
- [ ] **Step 5** Commit
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add AppConfig store + User.active flag"
```

### Task 2: Config schemas
**Files:** Create `src/lib/settings-schemas.ts`; Test `src/test/settings-schemas.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
// src/test/settings-schemas.test.ts
import { describe, it, expect } from "vitest";
import { orgConfigSchema, slaConfigSchema, routingConfigSchema } from "@/lib/settings-schemas";

describe("orgConfigSchema", () => {
  it("accepts a valid org config", () => {
    expect(orgConfigSchema.parse({ name: "CallOne", timezone: "America/New_York", supportEmail: "noc@callone.com",
      businessHours: { start: "08:00", end: "18:00", days: [1,2,3,4,5] } }).name).toBe("CallOne");
  });
  it("rejects bad email", () => {
    expect(orgConfigSchema.safeParse({ name: "X", timezone: "UTC", supportEmail: "nope" }).success).toBe(false);
  });
});

describe("slaConfigSchema", () => {
  it("requires positive minutes for each priority", () => {
    const ok = slaConfigSchema.safeParse({ P1: 60, P2: 240, P3: 480, P4: 1440, autoResolveHours: 24 });
    expect(ok.success).toBe(true);
    expect(slaConfigSchema.safeParse({ P1: -1, P2: 1, P3: 1, P4: 1, autoResolveHours: 1 }).success).toBe(false);
  });
});

describe("routingConfigSchema", () => {
  it("maps each AlertSeverity to a priority", () => {
    const r = routingConfigSchema.safeParse({ severityToPriority: { CRITICAL: "P1", HIGH: "P2", MEDIUM: "P3", LOW: "P4", INFO: "P4" } });
    expect(r.success).toBe(true);
  });
});
```
- [ ] **Step 2** Run: `npx vitest run src/test/settings-schemas.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**
```typescript
// src/lib/settings-schemas.ts
import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const orgConfigSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  businessHours: z.object({
    start: time, end: time, days: z.array(z.number().int().min(0).max(6)).max(7),
  }).optional(),
});

const minutes = z.number().int().positive();
export const slaConfigSchema = z.object({
  P1: minutes, P2: minutes, P3: minutes, P4: minutes,
  autoResolveHours: z.number().int().positive(),
});

const priority = z.enum(["P1", "P2", "P3", "P4"]);
export const routingConfigSchema = z.object({
  severityToPriority: z.object({
    CRITICAL: priority, HIGH: priority, MEDIUM: priority, LOW: priority, INFO: priority,
  }),
});

export type OrgConfig = z.infer<typeof orgConfigSchema>;
export type SlaConfig = z.infer<typeof slaConfigSchema>;
export type RoutingConfig = z.infer<typeof routingConfigSchema>;

export const DEFAULT_SLA: SlaConfig = { P1: 60, P2: 240, P3: 480, P4: 1440, autoResolveHours: 24 };
export const DEFAULT_ROUTING: RoutingConfig = {
  severityToPriority: { CRITICAL: "P1", HIGH: "P2", MEDIUM: "P3", LOW: "P4", INFO: "P4" },
};
```
- [ ] **Step 4** Run the test → PASS.
- [ ] **Step 5** Commit
```bash
git add src/lib/settings-schemas.ts src/test/settings-schemas.test.ts
git commit -m "feat: add settings config schemas (org/sla/routing)"
```

### Task 3: Typed config accessor + access helper
**Files:** Create `src/lib/app-config.ts`; extend `src/lib/vnoc-access.ts`; Test `src/test/app-config.test.ts`.

- [ ] **Step 1: Write the failing test** — `getAppConfig("sla")` returns `DEFAULT_SLA` when no row exists; `setAppConfig("sla", value)` upserts. Mock `prisma.appConfig`.
```typescript
// src/test/app-config.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { appConfig: { findUnique: vi.fn(), upsert: vi.fn() } } }));
import { prisma } from "@/lib/prisma";
import { getSlaConfig, setAppConfig } from "@/lib/app-config";
import { DEFAULT_SLA } from "@/lib/settings-schemas";
const mockFind = vi.mocked(prisma.appConfig.findUnique);
const mockUpsert = vi.mocked(prisma.appConfig.upsert);
beforeEach(() => vi.resetAllMocks());

it("returns defaults when unset", async () => {
  mockFind.mockResolvedValueOnce(null);
  expect(await getSlaConfig()).toEqual(DEFAULT_SLA);
});
it("returns stored sla when present", async () => {
  mockFind.mockResolvedValueOnce({ key: "sla", value: { ...DEFAULT_SLA, P1: 30 } } as never);
  expect((await getSlaConfig()).P1).toBe(30);
});
it("setAppConfig upserts", async () => {
  await setAppConfig("sla", DEFAULT_SLA);
  expect(mockUpsert).toHaveBeenCalled();
});
```
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3: Implement**
```typescript
// src/lib/app-config.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { slaConfigSchema, routingConfigSchema, orgConfigSchema, DEFAULT_SLA, DEFAULT_ROUTING,
  type SlaConfig, type RoutingConfig, type OrgConfig } from "@/lib/settings-schemas";

async function read(key: string): Promise<unknown> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setAppConfig(key: string, value: unknown): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue },
    create: { key, value: value as Prisma.InputJsonValue },
  });
}

export async function getSlaConfig(): Promise<SlaConfig> {
  const parsed = slaConfigSchema.safeParse(await read("sla"));
  return parsed.success ? parsed.data : DEFAULT_SLA;
}
export async function getRoutingConfig(): Promise<RoutingConfig> {
  const parsed = routingConfigSchema.safeParse(await read("routing"));
  return parsed.success ? parsed.data : DEFAULT_ROUTING;
}
export async function getOrgConfig(): Promise<OrgConfig | null> {
  const parsed = orgConfigSchema.safeParse(await read("org"));
  return parsed.success ? parsed.data : null;
}
```
- [ ] **Step 4** Add to `src/lib/vnoc-access.ts`:
```typescript
export function canManageSettings(session: Session | null): boolean {
  if (!session?.user) return false;
  return Boolean(session.user.isSuperAdmin) || session.user.vnocRole === "MANAGER";
}
```
- [ ] **Step 5** Run → PASS. Commit
```bash
git add src/lib/app-config.ts src/lib/vnoc-access.ts src/test/app-config.test.ts
git commit -m "feat: add AppConfig accessor + canManageSettings"
```

---

## Phase 2 — Settings API + tabbed shell

### Task 4: Settings API route
**Files:** Create `src/app/api/settings/route.ts`; Test `src/test/api/settings.test.ts`.

- [ ] **Step 1: Write failing tests** covering: GET returns `{ org, sla, routing }` (defaults when unset); PUT with `{ domain: "sla", value }` validates + persists + audits; 401 unauth, 403 non-manager, 400 invalid value, 400 unknown domain. (Mock `next-auth`, `prisma.appConfig`, `prisma.activityLog`; reuse the `customers.test.ts` mock style.)
- [ ] **Step 2** Run `npx vitest run src/test/api/settings.test.ts` → FAIL.
- [ ] **Step 3: Implement** `GET` (assemble all three via the accessors) and `PUT`:
  - Guard with `getServerSession` + `canManageSettings` (403 otherwise).
  - Body `{ domain, value }`; pick schema by domain (`org→orgConfigSchema`, `sla→slaConfigSchema`, `routing→routingConfigSchema`); 400 on unknown domain or invalid value.
  - `setAppConfig(domain, parsed)`, then `prisma.activityLog.create({ data: { type: "settings_updated", userId, message: \`Updated ${domain} settings\`, meta: { domain } } })`.
  - Return `{ success: true, data: parsed }`.
- [ ] **Step 4** Run → PASS. Commit
```bash
git add src/app/api/settings/route.ts src/test/api/settings.test.ts
git commit -m "feat: add settings API (org/sla/routing) with validation + audit"
```

### Task 5: Tabbed settings shell + Organization & SLA/Routing tabs
**Files:** Modify `src/app/(app)/settings/page.tsx`; create `SettingsTabs.tsx`, `OrgSettingsForm.tsx`, `SlaRoutingForm.tsx`; fold existing `SettingsClient` (platforms) in as the "Integrations" tab; make `src/app/(app)/settings/platform/page.tsx` redirect to `/settings?tab=integrations`.

- [ ] **Step 1** Update `page.tsx` guard to `canManageSettings` (was super-admin only); fetch initial config server-side via the accessors; render `SettingsTabs`.
- [ ] **Step 2** Build `SettingsTabs` with tabs: Organization · SLA & Routing · Integrations · Users (link to `/users`). Follow the existing card/border/`bg-card` styling used in `SettingsClient` and the customers UI.
- [ ] **Step 3** `OrgSettingsForm` (name, timezone `<select>` of common zones, support email, business hours) → `PUT /api/settings { domain: "org" }`. `SlaRoutingForm` (4 priority minute inputs + auto-resolve hours + severity→priority selects) → `PUT` for `sla` and `routing`. Inline validation messages from the API.
- [ ] **Step 4** Redirect `settings/platform/page.tsx` → `/settings?tab=integrations`.
- [ ] **Step 5** Manual verify (`npm run dev`): each tab loads, saves, reloads with persisted values; non-manager is redirected.
- [ ] **Step 6** Commit
```bash
git add "src/app/(app)/settings"
git commit -m "feat: tabbed settings shell with org + SLA/routing tabs"
```

### Task 6: Wire SLA/routing config into behavior
**Files:** Modify the ticket-creation path (where `slaDeadline` is set) and the auto-resolve cron/lib.

- [ ] **Step 1** Find where `slaDeadline` is computed and where alert severity → ticket priority is decided (search `slaDeadline`, `TicketPriority`, auto-resolve in `src/lib/correlation.ts` and `src/app/api/cron`).
- [ ] **Step 2: Write/extend a test** asserting ticket priority + `slaDeadline` derive from `getRoutingConfig()`/`getSlaConfig()` (mock the accessors to non-default values and assert the computed deadline/priority change). Run → FAIL.
- [ ] **Step 3** Replace hardcoded SLA minutes / severity mapping with values from `getSlaConfig()` / `getRoutingConfig()`. Auto-resolve cron reads `autoResolveHours`.
- [ ] **Step 4** Run tests → PASS (existing correlation/auto-resolve tests still green). Commit
```bash
git add src/lib src/app/api/cron src/test
git commit -m "feat: drive SLA deadlines + severity routing from AppConfig"
```

---

## Phase 3 — User & role management

### Task 7: Implement `PATCH /api/users/[id]/permissions`
**Files:** Rewrite `src/app/api/users/[id]/permissions/route.ts` (currently a no-arg stub); Test `src/test/api/user-permissions.test.ts`.

- [ ] **Step 1: Write failing tests**: super-admin can set `vnocRole` (TIER1/TIER2/MANAGER) and toggle `isSuperAdmin`; non-super-admin → 403; cannot remove own super-admin (guard against self-lockout) → 400; unknown user → 404; writes an `ActivityLog` `user_role_changed`. Mock `next-auth`, `prisma.user`/`prisma.profile`/`prisma.activityLog`.
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3: Implement** proper handler:
```typescript
// src/app/api/users/[id]/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  vnocRole: z.enum(["TIER1", "TIER2", "MANAGER"]).nullable().optional(),
  isSuperAdmin: z.boolean().optional(),
}).refine((d) => d.vnocRole !== undefined || d.isSuperAdmin !== undefined, { message: "Nothing to update" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  if (id === session.user.id && parsed.data.isSuperAdmin === false) {
    return NextResponse.json({ error: "You cannot remove your own super-admin access" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (parsed.data.isSuperAdmin !== undefined) {
      await prisma.user.update({ where: { id }, data: { isSuperAdmin: parsed.data.isSuperAdmin } });
    }
    if (parsed.data.vnocRole !== undefined) {
      await prisma.profile.update({ where: { userId: id }, data: { vnocRole: parsed.data.vnocRole } });
    }
    await prisma.activityLog.create({
      data: { type: "user_role_changed", userId: session.user.id,
        message: `Updated roles for ${user.email}`, meta: { targetUserId: id, ...parsed.data } },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update permissions:", err);
    return NextResponse.json({ error: "Failed to update permissions" }, { status: 500 });
  }
}
```
- [ ] **Step 4** Run → PASS. Commit
```bash
git add "src/app/api/users/[id]/permissions/route.ts" src/test/api/user-permissions.test.ts
git commit -m "feat: implement user role + super-admin assignment"
```

### Task 8: Deactivate / reactivate users + block inactive login
**Files:** Add `PATCH`/extend `src/app/api/users/[id]/route.ts` for `active`; modify `src/lib/auth.ts` (CredentialsProvider authorize) to reject inactive users; Test extends `src/test/auth.test.ts`.

- [ ] **Step 1: Write failing tests**: setting `active:false` blocks login in the authorize callback; super-admin-only; cannot deactivate self.
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement the active toggle (super-admin only, self-guard, audit `user_deactivated`) and add an `if (!user.active) return null;` check in the `authorize` callback.
- [ ] **Step 4** Run → PASS. Commit
```bash
git add "src/app/api/users/[id]/route.ts" src/lib/auth.ts src/test/auth.test.ts
git commit -m "feat: user deactivation + block inactive login"
```

### Task 9: Users admin UI — roles & status
**Files:** Modify `src/app/(admin)/users/UsersManager.tsx` and `users/page.tsx` (select `active`, `profile.vnocRole`).

- [ ] **Step 1** Surface each user's `vnocRole`, `isSuperAdmin`, and `active`.
- [ ] **Step 2** Add a role dropdown (TIER1/TIER2/MANAGER) + super-admin toggle → `PATCH /api/users/[id]/permissions`; add deactivate/reactivate button → `PATCH /api/users/[id]`. Disable self-destructive actions on the current user's own row.
- [ ] **Step 3** Manual verify roles persist and an inactive user cannot log in.
- [ ] **Step 4** Commit
```bash
git add "src/app/(admin)/users"
git commit -m "feat: role assignment + deactivation in users admin UI"
```

---

## Phase 4 — Verification
- [ ] `npx prisma generate` then `npx tsc --noEmit` → clean
- [ ] `npx vitest run` → all pass
- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → succeeds
- [ ] E2E (after the testing-overhaul plan adds it): settings save flow + role change flow.

---

## Self-Review Notes
- **Scope coverage:** Org settings (Task 5) ✓ · SLA & routing config + real wiring (Tasks 4–6) ✓ · User/role mgmt incl. the stubbed permissions endpoint (Tasks 7–9) ✓ · Integrations consolidated into the shell (Task 5) ✓.
- **One migration** (`AppConfig` + `User.active`) — justified; the rest is additive.
- **Self-lockout guards** on super-admin removal and self-deactivation.
- **Integration with Logi plan:** the Logitech cert form (Logi plan Task 6) lands in the Integrations tab of this shell.
