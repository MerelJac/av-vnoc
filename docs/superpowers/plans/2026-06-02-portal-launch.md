# Portal Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Open in {Platform}" button to the ticket's device card that launches the vendor portal — deep-linked to the device when possible, else the portal home — and records the launch in the ticket Timeline.

**Architecture:** A pure `portal-links.ts` module maps a device context to a URL (config-template override → code builder → portal-home fallback). The ticket page builds the link **server-side** (so credential config never reaches the browser) and passes the finished `{url, isDeepLink, label}` to a small client `PortalLaunchButton` that renders a native `target="_blank"` anchor and fires a non-blocking `PORTAL_LAUNCH` audit POST.

**Tech Stack:** Next.js 15 (App Router), React 19, Prisma 7 (Postgres), Vitest 4 + @testing-library/react, Tailwind v4, lucide-react.

**Reference spec:** `docs/superpowers/specs/2026-06-02-portal-launch-design.md`

**Conventions in this repo (follow exactly):**
- Tests live in `src/test/`, run with `npm run test:run` (all) or `npx vitest run <file>` (one file). Coverage: `npm run coverage` (floors: statements 80 / branches 68 / functions 80 / lines 80; only files imported by tests count).
- Path alias `@/*` → `./src/*`.
- Prisma client property for `model PlatformCredential` is `prisma.platformCredential`; for `model TicketAction` it is `prisma.ticketAction`.
- `prisma migrate dev` / `prisma db seed` need `DATABASE_URL` set (see `.env`).
- Commit messages: `<type>: <description>` (no attribution trailer — disabled globally).

---

### Task 1: `portal-links.ts` pure URL builder

**Files:**
- Create: `src/lib/portal-links.ts`
- Test: `src/test/portal-links.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/portal-links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPortalLink } from "@/lib/portal-links";
import type { Platform } from "@prisma/client";

const base = {
  platformId: "dev-123",
  deviceRawPayload: {} as unknown,
  credentialConfig: null as Record<string, unknown> | null,
};

describe("buildPortalLink — deep-link platforms", () => {
  it("builds a Poly Lens device deep link", () => {
    const link = buildPortalLink({ ...base, platform: "POLY_LENS" as Platform });
    expect(link.isDeepLink).toBe(true);
    expect(link.url).toBe("https://lens.poly.com/devices/dev-123");
    expect(link.label).toBe("Open in Poly Lens");
  });

  it("builds a Yealink YMCS device deep link", () => {
    const link = buildPortalLink({ ...base, platform: "YEALINK_YMCS" as Platform });
    expect(link.isDeepLink).toBe(true);
    expect(link.url).toContain("ymcs.yealink.com");
    expect(link.url).toContain("dev-123");
    expect(link.label).toBe("Open in Yealink YMCS");
  });

  it("URL-encodes the device id", () => {
    const link = buildPortalLink({
      ...base,
      platform: "POLY_LENS" as Platform,
      platformId: "a b/c",
    });
    expect(link.url).toBe("https://lens.poly.com/devices/a%20b%2Fc");
  });
});

describe("buildPortalLink — portal-home fallback platforms", () => {
  it.each([
    ["NEAT_PULSE", "https://pulse.neat.no", "Open in Neat Pulse"],
    ["LOGITECH_SYNC", "https://sync.logitech.com", "Open in Logitech Sync"],
    ["CISCO_CONTROL_HUB", "https://admin.webex.com", "Open in Cisco Control Hub"],
    ["UTELOGY", "https://app.utelogy.com", "Open in Utelogy"],
  ])("falls back to portal home for %s", (platform, url, label) => {
    const link = buildPortalLink({ ...base, platform: platform as Platform });
    expect(link.isDeepLink).toBe(false);
    expect(link.url).toBe(url);
    expect(link.label).toBe(label);
  });
});

describe("buildPortalLink — config override", () => {
  it("uses portalUrlTemplate and interpolates {deviceId} and {tenantId}", () => {
    const link = buildPortalLink({
      ...base,
      platform: "POLY_LENS" as Platform,
      platformId: "dev-9",
      credentialConfig: {
        portalUrlTemplate: "https://lens.poly.com/t/{tenantId}/d/{deviceId}",
        tenantId: "tenant-42",
      },
    });
    expect(link.isDeepLink).toBe(true);
    expect(link.url).toBe("https://lens.poly.com/t/tenant-42/d/dev-9");
  });

  it("interpolates {macAddress} from device rawPayload", () => {
    const link = buildPortalLink({
      ...base,
      platform: "UTELOGY" as Platform,
      deviceRawPayload: { macAddress: "AA:BB:CC" },
      credentialConfig: { portalUrlTemplate: "https://app.utelogy.com/d/{macAddress}" },
    });
    expect(link.url).toBe("https://app.utelogy.com/d/AA%3ABB%3ACC");
  });

  it("rejects a non-https template and falls back to the code builder", () => {
    const link = buildPortalLink({
      ...base,
      platform: "POLY_LENS" as Platform,
      credentialConfig: { portalUrlTemplate: "http://evil.example/{deviceId}" },
    });
    expect(link.url).toBe("https://lens.poly.com/devices/dev-123");
    expect(link.isDeepLink).toBe(true);
  });

  it("rejects a non-https template and falls back to home for non-builder platforms", () => {
    const link = buildPortalLink({
      ...base,
      platform: "NEAT_PULSE" as Platform,
      credentialConfig: { portalUrlTemplate: "javascript:alert(1)" },
    });
    expect(link.url).toBe("https://pulse.neat.no");
    expect(link.isDeepLink).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/portal-links.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/portal-links"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/portal-links.ts`:

```ts
import { Platform } from "@prisma/client";

export interface PortalLinkContext {
  platform: Platform;
  platformId: string;
  deviceRawPayload: unknown;
  credentialConfig: Record<string, unknown> | null; // PlatformCredential.config — SERVER ONLY
}

export interface PortalLink {
  url: string;
  isDeepLink: boolean;
  label: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  POLY_LENS: "Poly Lens",
  YEALINK_YMCS: "Yealink YMCS",
  NEAT_PULSE: "Neat Pulse",
  LOGITECH_SYNC: "Logitech Sync",
  CISCO_CONTROL_HUB: "Cisco Control Hub",
  UTELOGY: "Utelogy",
};

// Portal front doors — the graceful fallback when we cannot build a device link.
const PORTAL_HOME: Record<Platform, string> = {
  POLY_LENS: "https://lens.poly.com",
  YEALINK_YMCS: "https://ymcs.yealink.com",
  NEAT_PULSE: "https://pulse.neat.no",
  LOGITECH_SYNC: "https://sync.logitech.com",
  CISCO_CONTROL_HUB: "https://admin.webex.com",
  UTELOGY: "https://app.utelogy.com",
};

type DeepLinkBuilder = (ctx: PortalLinkContext) => string | null;

// Device-page builders for the platforms we integrate with today.
// NOTE: the exact paths are behind authenticated portals and pending live
// verification. `config.portalUrlTemplate` is the no-deploy correction path.
const DEEP_LINK_BUILDERS: Partial<Record<Platform, DeepLinkBuilder>> = {
  POLY_LENS: (ctx) => `https://lens.poly.com/devices/${encodeURIComponent(ctx.platformId)}`,
  YEALINK_YMCS: (ctx) =>
    `https://ymcs.yealink.com/console/devices/detail?id=${encodeURIComponent(ctx.platformId)}`,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(source: Record<string, unknown> | null, key: string): string {
  if (source && typeof source[key] === "string") return source[key] as string;
  return "";
}

// Replaces {deviceId}/{tenantId}/{macAddress} tokens. Returns the URL only if it
// is https (otherwise null, so the caller falls through to safer defaults).
function interpolateTemplate(template: string, ctx: PortalLinkContext): string | null {
  const tenantId = stringField(ctx.credentialConfig, "tenantId");
  const rawPayload = isRecord(ctx.deviceRawPayload) ? ctx.deviceRawPayload : null;
  const macAddress = stringField(rawPayload, "macAddress");

  const url = template
    .replaceAll("{deviceId}", encodeURIComponent(ctx.platformId))
    .replaceAll("{tenantId}", encodeURIComponent(tenantId))
    .replaceAll("{macAddress}", encodeURIComponent(macAddress));

  return url.startsWith("https://") ? url : null;
}

// Total function: always returns a usable PortalLink and never throws.
export function buildPortalLink(ctx: PortalLinkContext): PortalLink {
  const label = `Open in ${PLATFORM_LABELS[ctx.platform]}`;

  // 1. Admin override template (no-deploy correction path).
  const template = ctx.credentialConfig?.portalUrlTemplate;
  if (typeof template === "string" && template.length > 0) {
    const url = interpolateTemplate(template, ctx);
    if (url) return { url, isDeepLink: true, label };
  }

  // 2. Code builder for platforms we know.
  const built = DEEP_LINK_BUILDERS[ctx.platform]?.(ctx) ?? null;
  if (built) return { url: built, isDeepLink: true, label };

  // 3. Portal-home fallback.
  return { url: PORTAL_HOME[ctx.platform], isDeepLink: false, label };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/portal-links.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal-links.ts src/test/portal-links.test.ts
git commit -m "feat: add portal-links URL builder for device portal launch"
```

---

### Task 2: Add `PORTAL_LAUNCH` to the `TicketActionType` enum

**Files:**
- Modify: `prisma/schema.prisma` (the `enum TicketActionType` block)
- Create: `prisma/migrations/<timestamp>_add_portal_launch_action/migration.sql` (generated)

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, change the enum from:

```prisma
enum TicketActionType {
  NOTE
  REBOOT
  FIRMWARE_PUSH
  ESCALATE
  STATUS_CHANGE
  CONFIG_RESTORE
}
```

to:

```prisma
enum TicketActionType {
  NOTE
  REBOOT
  FIRMWARE_PUSH
  ESCALATE
  STATUS_CHANGE
  CONFIG_RESTORE
  PORTAL_LAUNCH
}
```

- [ ] **Step 2: Generate the migration and client**

Run: `npx prisma migrate dev --name add_portal_launch_action`
Expected: a new migration folder is created containing
`ALTER TYPE "TicketActionType" ADD VALUE 'PORTAL_LAUNCH';`, the migration applies
cleanly, and the Prisma client regenerates. (Requires `DATABASE_URL`.)

- [ ] **Step 3: Verify the type is available**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors (the regenerated client now includes
`"PORTAL_LAUNCH"` in `TicketActionType`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add PORTAL_LAUNCH ticket action type + migration"
```

---

### Task 3: Allow `PORTAL_LAUNCH` in the ticket actions API

**Files:**
- Modify: `src/app/api/tickets/[id]/actions/route.ts` (the `ActionSchema` enum + `canPerformAction`)
- Test: `src/test/ticket-actions.test.ts` (extend the existing mirror tests)

> This route file cannot export `ActionSchema`/`canPerformAction` (Next.js route
> files only allow HTTP-method exports), so `ticket-actions.test.ts` mirrors those
> two values locally — the established pattern in this repo. Update the mirror **and**
> the real route together.

- [ ] **Step 1: Write the failing test**

In `src/test/ticket-actions.test.ts`, add `PORTAL_LAUNCH` assertions WITHOUT yet
changing the local `ActionSchema`/`canPerformAction` copies. Append these tests
inside the existing `describe` blocks:

Add to the `describe("ticket action schema", …)` block:

```ts
  it("accepts a PORTAL_LAUNCH action", () => {
    expect(ActionSchema.safeParse({ type: "PORTAL_LAUNCH", body: "Poly Lens · device deep-link" }).success).toBe(true);
  });
```

Add to the `describe("canPerformAction", …)` block:

```ts
  it("allows TIER1 to launch a portal", () => {
    expect(canPerformAction("PORTAL_LAUNCH", false, "TIER1")).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/ticket-actions.test.ts`
Expected: FAIL — the local mirror `ActionSchema` rejects `PORTAL_LAUNCH`
(`success` is `false`), and `canPerformAction("PORTAL_LAUNCH", …)` returns `false`.

- [ ] **Step 3: Update the mirror copies in the test**

In `src/test/ticket-actions.test.ts`, update the two local declarations:

```ts
const ActionSchema = z.object({
  type: z.enum(['NOTE', 'REBOOT', 'FIRMWARE_PUSH', 'ESCALATE', 'STATUS_CHANGE', 'CONFIG_RESTORE', 'PORTAL_LAUNCH']),
  body: z.string().optional(),
  newStatus: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
})

function canPerformAction(actionType: string, isSuperAdmin: boolean, vnocRole: VnocRole | null): boolean {
  const tier1Actions = new Set(['NOTE', 'REBOOT', 'STATUS_CHANGE', 'PORTAL_LAUNCH'])
  if (tier1Actions.has(actionType)) return true
  if (actionType === 'ESCALATE') return isSuperAdmin || vnocRole === 'TIER2' || vnocRole === 'MANAGER'
  return isSuperAdmin
}
```

- [ ] **Step 4: Update the real route to match**

In `src/app/api/tickets/[id]/actions/route.ts`, update the real `ActionSchema` enum
and the `tier1Actions` set identically:

```ts
const ActionSchema = z.object({
  type: z.enum(["NOTE", "REBOOT", "FIRMWARE_PUSH", "ESCALATE", "STATUS_CHANGE", "CONFIG_RESTORE", "PORTAL_LAUNCH"]),
  body: z.string().optional(),
  newStatus: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});
```

```ts
  const tier1Actions = new Set(["NOTE", "REBOOT", "STATUS_CHANGE", "PORTAL_LAUNCH"]);
```

No other route changes are needed: `PORTAL_LAUNCH` is neither `REBOOT` nor
`STATUS_CHANGE`, so it skips those side-effect branches and simply creates the
`TicketAction` via the existing `prisma.ticketAction.create(...)` call.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/test/ticket-actions.test.ts`
Expected: PASS — the new `PORTAL_LAUNCH` schema and permission tests are green.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tickets/[id]/actions/route.ts src/test/ticket-actions.test.ts
git commit -m "feat: accept PORTAL_LAUNCH ticket action (tier-1 allowed)"
```

---

### Task 4: `PortalLaunchButton` client component

**Files:**
- Create: `src/app/(app)/tickets/[id]/PortalLaunchButton.tsx`
- Test: `src/test/portal-launch-button.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/portal-launch-button.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalLaunchButton } from "@/app/(app)/tickets/[id]/PortalLaunchButton";
import type { PortalLink } from "@/lib/portal-links";

const deepLink: PortalLink = {
  url: "https://lens.poly.com/devices/dev-1",
  isDeepLink: true,
  label: "Open in Poly Lens",
};
const homeLink: PortalLink = {
  url: "https://pulse.neat.no",
  isDeepLink: false,
  label: "Open in Neat Pulse",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "a1" } }) }),
  );
});

describe("PortalLaunchButton", () => {
  it("renders an external anchor to the deep link with safe rel", () => {
    render(<PortalLaunchButton ticketId="t1" portalLink={deepLink} />);
    const link = screen.getByRole("link", { name: /Open in Poly Lens/ });
    expect(link).toHaveAttribute("href", "https://lens.poly.com/devices/dev-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows a (portal home) hint when the link is not a deep link", () => {
    render(<PortalLaunchButton ticketId="t1" portalLink={homeLink} />);
    expect(screen.getByText("(portal home)")).toBeInTheDocument();
  });

  it("posts a PORTAL_LAUNCH audit action on click", async () => {
    render(<PortalLaunchButton ticketId="t-7" portalLink={deepLink} />);
    await userEvent.click(screen.getByRole("link", { name: /Open in Poly Lens/ }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/tickets/t-7/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "PORTAL_LAUNCH", body: "Poly Lens · device deep-link" }),
      }),
    );
  });

  it("invokes onLogged with the server action", async () => {
    const onLogged = vi.fn();
    render(<PortalLaunchButton ticketId="t1" portalLink={deepLink} onLogged={onLogged} />);
    await userEvent.click(screen.getByRole("link", { name: /Open in Poly Lens/ }));
    await vi.waitFor(() => expect(onLogged).toHaveBeenCalledWith({ id: "a1" }));
  });
});
```

> Note: clicking a `target="_blank"` anchor in jsdom logs a benign
> "Not implemented: navigation" message — that is expected and does not fail the test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/portal-launch-button.test.tsx`
Expected: FAIL — `Failed to resolve import "@/app/(app)/tickets/[id]/PortalLaunchButton"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/(app)/tickets/[id]/PortalLaunchButton.tsx`:

```tsx
"use client";

import { ExternalLink } from "lucide-react";
import type { PortalLink } from "@/lib/portal-links";

interface PortalLaunchButtonProps {
  ticketId: string;
  portalLink: PortalLink;
  onLogged?: (action: unknown) => void;
}

export function PortalLaunchButton({ ticketId, portalLink, onLogged }: PortalLaunchButtonProps) {
  const platformName = portalLink.label.replace(/^Open in /, "");
  const linkKind = portalLink.isDeepLink ? "device deep-link" : "portal home";

  // Fire-and-forget audit. Must NOT preventDefault — the anchor's native
  // target="_blank" navigation opens the portal on the genuine user gesture
  // (popup-blocker safe). keepalive lets the POST complete regardless.
  function logLaunch() {
    fetch(`/api/tickets/${ticketId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "PORTAL_LAUNCH", body: `${platformName} · ${linkKind}` }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data && onLogged) onLogged(json.data);
      })
      .catch(() => {
        // Portal already opened; the audit record is best-effort.
      });
  }

  return (
    <a
      href={portalLink.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={logLaunch}
      className="mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-secondary-color/10 text-secondary-color hover:bg-secondary-color/20 transition-colors"
    >
      <ExternalLink className="w-4 h-4" />
      {portalLink.label}
      {!portalLink.isDeepLink && <span className="text-xs text-muted">(portal home)</span>}
    </a>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/portal-launch-button.test.tsx`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/tickets/[id]/PortalLaunchButton.tsx" src/test/portal-launch-button.test.tsx
git commit -m "feat: add PortalLaunchButton with non-blocking launch audit"
```

---

### Task 5: Render the button in `TicketDetail`

**Files:**
- Modify: `src/app/(app)/tickets/[id]/TicketDetail.tsx`

- [ ] **Step 1: Add the imports**

At the top of `src/app/(app)/tickets/[id]/TicketDetail.tsx`, add below the existing
imports:

```tsx
import { PortalLaunchButton } from "./PortalLaunchButton";
import type { PortalLink } from "@/lib/portal-links";
```

- [ ] **Step 2: Add the prop to the component interface**

In the `TicketDetailProps` interface, add a `portalLink` field after `isSuperAdmin`:

```tsx
  vnocRole: VnocRole | null;
  isSuperAdmin: boolean;
  portalLink?: PortalLink | null;
}
```

- [ ] **Step 3: Destructure the new prop**

Change the function signature from:

```tsx
export function TicketDetail({ ticket, vnocRole, isSuperAdmin }: TicketDetailProps) {
```

to:

```tsx
export function TicketDetail({ ticket, vnocRole, isSuperAdmin, portalLink }: TicketDetailProps) {
```

- [ ] **Step 4: Render the button inside the device card**

In the device-card block, change:

```tsx
        {ticket.alert?.device && (
          <div className="mt-4 p-3 bg-surface2/60 rounded-xl text-sm">
            <p className="font-medium text-foreground">{ticket.alert.device.name}</p>
            <p className="text-muted">
              {ticket.alert.device.room?.site?.name ?? ""} {ticket.alert.device.room?.name ?? ""} · Status: {ticket.alert.device.status}
            </p>
          </div>
        )}
```

to:

```tsx
        {ticket.alert?.device && (
          <div className="mt-4 p-3 bg-surface2/60 rounded-xl text-sm">
            <p className="font-medium text-foreground">{ticket.alert.device.name}</p>
            <p className="text-muted">
              {ticket.alert.device.room?.site?.name ?? ""} {ticket.alert.device.room?.name ?? ""} · Status: {ticket.alert.device.status}
            </p>
            {portalLink && (
              <PortalLaunchButton
                ticketId={ticket.id}
                portalLink={portalLink}
                onLogged={(a) => setActions((prev) => [...prev, a as Action])}
              />
            )}
          </div>
        )}
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS — `TicketDetail` accepts the optional `portalLink` prop; the existing
unit tests are unaffected.

- [ ] **Step 6: Run the test suite to confirm nothing regressed**

Run: `npm run test:run`
Expected: PASS — all suites green (including Tasks 1, 3, 4).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/tickets/[id]/TicketDetail.tsx"
git commit -m "feat: render portal launch button on ticket device card"
```

---

### Task 6: Build the portal link server-side in the ticket page

**Files:**
- Modify: `src/app/(app)/tickets/[id]/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/app/(app)/tickets/[id]/page.tsx`, add below the existing imports:

```tsx
import { buildPortalLink, type PortalLink } from "@/lib/portal-links";
```

- [ ] **Step 2: Build the link after the ticket loads**

Immediately after the `if (!ticket) notFound();` line, add:

```tsx
  // Build the vendor portal link server-side so PlatformCredential.config
  // (which caches the OAuth access token) never reaches the client.
  let portalLink: PortalLink | null = null;
  const device = ticket.alert?.device;
  if (device) {
    const cred = await prisma.platformCredential.findUnique({
      where: { platform: device.platform },
      select: { config: true },
    });
    portalLink = buildPortalLink({
      platform: device.platform,
      platformId: device.platformId,
      deviceRawPayload: device.rawPayload,
      credentialConfig: (cred?.config as Record<string, unknown> | null) ?? null,
    });
  }
```

- [ ] **Step 3: Pass the prop to `TicketDetail`**

Change the render from:

```tsx
  return (
    <TicketDetail
      ticket={serialized as Parameters<typeof TicketDetail>[0]["ticket"]}
      vnocRole={session.user.vnocRole}
      isSuperAdmin={session.user.isSuperAdmin}
    />
  );
```

to:

```tsx
  return (
    <TicketDetail
      ticket={serialized as Parameters<typeof TicketDetail>[0]["ticket"]}
      vnocRole={session.user.vnocRole}
      isSuperAdmin={session.user.isSuperAdmin}
      portalLink={portalLink}
    />
  );
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS — `device.platform`, `device.platformId`, and `device.rawPayload` are
all present on the included device; `portalLink` matches the prop type from Task 5.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/tickets/[id]/page.tsx"
git commit -m "feat: pass server-built portal link to ticket detail"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite with coverage**

Run: `npm run coverage`
Expected: PASS — all suites green and coverage floors held
(statements ≥ 80, branches ≥ 68, functions ≥ 80, lines ≥ 80). `portal-links.ts` and
`PortalLaunchButton.tsx` are fully exercised by their tests.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in the created/modified files.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS — `prisma generate` + `next build` complete without type errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, then:
1. Open a ticket whose alert has a device (e.g. a `POLY_LENS` device from the seed
   data) at `/tickets/<id>`.
2. Confirm an "Open in Poly Lens" button shows on the device card and that it opens
   `https://lens.poly.com/devices/<platformId>` in a new tab.
3. Open a ticket whose device platform has no builder (e.g. `NEAT_PULSE`) and confirm
   the button reads "Open in Neat Pulse (portal home)" and opens `https://pulse.neat.no`.
4. After clicking, reload the ticket and confirm a "portal launch" entry appears in
   the Timeline.

- [ ] **Step 5: Confirm the verification items in the spec**

Before shipping deep links to production, verify against the live portals (spec
§"Open verification items"): the exact Poly Lens and Yealink YMCS device-page paths,
and the Utelogy home URL. If a path is wrong, set
`PlatformCredential.config.portalUrlTemplate` (no deploy needed) or correct the
builder in `src/lib/portal-links.ts`.

---

## Self-Review

**Spec coverage:**
- Hybrid deep-link / fallback → Task 1 (`DEEP_LINK_BUILDERS` + `PORTAL_HOME`). ✓
- Code builders + config override → Task 1 (`interpolateTemplate`, resolution order). ✓
- Ticket-detail-only placement, visible when resolved → Task 5 (button in the always-rendered device card, outside the `!isResolved` block). ✓
- Audit via `PORTAL_LAUNCH` TicketAction in the Timeline → Tasks 2, 3, 4 (enum + route + non-blocking POST + `onLogged` append). ✓
- Server-side build, no secret leak → Task 6 (`select: { config: true }`, only `{url,isDeepLink,label}` crosses to the client). ✓
- Security: https-only template, `encodeURIComponent`, `rel="noopener noreferrer"` → Tasks 1 & 4. ✓
- Testing: unit (portal-links) + route mirror + button → Tasks 1, 3, 4, 7. ✓

**Placeholder scan:** No TBD/TODO in steps; every code step shows complete code; commands have expected output. The only "verify later" item is the intentional live-portal URL check (spec-acknowledged), isolated to Task 7 Step 5. ✓

**Type consistency:** `PortalLink { url, isDeepLink, label }` and `PortalLinkContext { platform, platformId, deviceRawPayload, credentialConfig }` are used identically in Tasks 1, 4, 5, 6. `buildPortalLink` signature matches its call site in Task 6. `PortalLaunchButton` props (`ticketId`, `portalLink`, `onLogged`) match its usage in Task 5. The action type string `"PORTAL_LAUNCH"` matches the enum (Task 2), Zod schema (Task 3), and POST body (Task 4). ✓
