# VNOC Phase 1+2: Data Model & Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Prisma schema with all VNOC models, set up Vitest, and extend NextAuth JWT to carry `vnocRole` — making the database and auth layer ready for all subsequent plans.

**Architecture:** All new Prisma models are additive — the existing auth schema (User, Organization, OrganizationMember, Profile, Session, Invite, PasswordResetToken) is unchanged except Profile gains an optional `vnocRole` field and User gains two new relations. VnocRole gates UI permissions server-side; `isSuperAdmin` on User remains the platform-admin gate.

**Tech Stack:** Prisma 7, PostgreSQL (Neon), NextAuth v4 JWT, Vitest 2, @testing-library/react

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `prisma/schema.prisma` | Add all new enums and models |
| Modify | `src/types/next-auth.d.ts` | Add `vnocRole` to Session, User, JWT |
| Modify | `src/lib/auth.ts` | Fetch `vnocRole` from profile in `jwt` callback |
| Modify | `prisma/seed.ts` | Seed Platform credentials and test customer/site/room/device data |
| Create | `vitest.config.ts` | Vitest config with React plugin and `@` alias |
| Create | `src/test/setup.ts` | Global test setup (jest-dom matchers) |

---

### Task 1: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths
```

Expected: No errors. `package.json` gains these devDependencies.

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add to the `"scripts"` block:

```json
"test": "vitest",
"test:run": "vitest run",
"test:ui": "vitest --ui",
"coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create vitest.config.ts**

Create `vitest.config.ts` at the project root:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
```

- [ ] **Step 4: Create src/test/setup.ts**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Write a smoke test to verify setup works**

Create `src/test/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('should run', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run the smoke test**

```bash
npm run test:run
```

Expected output:
```
✓ src/test/smoke.test.ts > vitest setup > should run
Test Files  1 passed
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/test/setup.ts src/test/smoke.test.ts package.json package-lock.json
git commit -m "chore: set up vitest with React Testing Library"
```

---

### Task 2: Add enums to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (append new enums after the existing `OrgRole` enum)

- [ ] **Step 1: Append new enums**

Open `prisma/schema.prisma`. After the existing `enum OrgRole { ... }` block, append:

```prisma
enum Platform {
  POLY_LENS
  YEALINK_YMCS
  NEAT_PULSE
  LOGITECH_SYNC
  CISCO_CONTROL_HUB
  UTELOGY
}

enum AlertSeverity {
  CRITICAL
  HIGH
  MEDIUM
  LOW
  INFO
}

enum AlertStatus {
  ACTIVE
  ACKNOWLEDGED
  AUTO_RESOLVED
  SUPPRESSED
  RESOLVED
}

enum TicketPriority {
  P1
  P2
  P3
  P4
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

enum VnocRole {
  TIER1
  TIER2
  MANAGER
}

enum AlertGroupType {
  ROOM_OUTAGE
  SITE_OUTAGE
  DEVICE_FAULT
}

enum TicketActionType {
  NOTE
  REBOOT
  FIRMWARE_PUSH
  ESCALATE
  STATUS_CHANGE
  CONFIG_RESTORE
}
```

- [ ] **Step 2: Verify schema parses**

```bash
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid!`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add VNOC enums to Prisma schema"
```

---

### Task 3: Add asset hierarchy models (Customer, Site, Room, Device)

**Files:**
- Modify: `prisma/schema.prisma` (append models)

- [ ] **Step 1: Append asset hierarchy models to schema.prisma**

After the enum block, append:

```prisma
model Customer {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sites       Site[]
  tickets     Ticket[]
  alertGroups AlertGroup[]
}

model Site {
  id         String   @id @default(uuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  name       String
  address    String?
  city       String?
  state      String?
  lat        Float?
  lng        Float?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  rooms       Room[]
  alertGroups AlertGroup[]

  @@index([customerId])
}

model Room {
  id        String   @id @default(uuid())
  siteId    String
  site      Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  devices     Device[]
  alerts      Alert[]
  alertGroups AlertGroup[]

  @@index([siteId])
}

model Device {
  id         String    @id @default(uuid())
  roomId     String?
  room       Room?     @relation(fields: [roomId], references: [id], onDelete: SetNull)
  platform   Platform
  platformId String
  name       String
  model      String?
  firmware   String?
  ipAddress  String?
  macAddress String?
  status     String    @default("unknown")
  lastSeenAt DateTime?
  rawPayload Json?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  alerts Alert[]

  @@unique([platform, platformId])
  @@index([roomId])
  @@index([platform])
}
```

- [ ] **Step 2: Validate schema**

```bash
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid!`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Customer, Site, Room, Device models to schema"
```

---

### Task 4: Add alert pipeline models (WebhookEvent, AlertGroup, Alert)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append alert pipeline models**

```prisma
model WebhookEvent {
  id          String    @id @default(uuid())
  platform    Platform
  eventId     String
  payload     Json
  processedAt DateTime?
  error       String?
  receivedAt  DateTime  @default(now())

  @@unique([platform, eventId])
  @@index([platform, eventId])
}

model AlertGroup {
  id         String         @id @default(uuid())
  type       AlertGroupType
  customerId String?
  customer   Customer?      @relation(fields: [customerId], references: [id])
  siteId     String?
  site       Site?          @relation(fields: [siteId], references: [id])
  roomId     String?
  room       Room?          @relation(fields: [roomId], references: [id])
  resolvedAt DateTime?
  createdAt  DateTime       @default(now())

  alerts Alert[]

  @@index([customerId])
  @@index([siteId])
  @@index([roomId])
}

model Alert {
  id              String        @id @default(uuid())
  platform        Platform
  platformAlertId String
  deviceId        String?
  device          Device?       @relation(fields: [deviceId], references: [id])
  roomId          String?
  room            Room?         @relation(fields: [roomId], references: [id])
  groupId         String?
  group           AlertGroup?   @relation(fields: [groupId], references: [id])
  severity        AlertSeverity
  status          AlertStatus   @default(ACTIVE)
  title           String
  description     String?
  rawPayload      Json
  receivedAt      DateTime
  autoCloseAt     DateTime?
  resolvedAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  ticket Ticket?

  @@unique([platform, platformAlertId])
  @@index([status])
  @@index([deviceId])
  @@index([roomId])
  @@index([groupId])
}
```

- [ ] **Step 2: Validate schema**

```bash
npx prisma validate
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add WebhookEvent, AlertGroup, Alert models to schema"
```

---

### Task 5: Add ticket models (Ticket, TicketAction)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/schema.prisma` — also add `assignedTickets` and `ticketActions` relations to existing `User` model

- [ ] **Step 1: Append Ticket and TicketAction models**

```prisma
model Ticket {
  id          String         @id @default(uuid())
  alertId     String         @unique
  alert       Alert          @relation(fields: [alertId], references: [id])
  customerId  String?
  customer    Customer?      @relation(fields: [customerId], references: [id])
  assignedTo  String?
  assignee    User?          @relation("TicketAssignee", fields: [assignedTo], references: [id])
  priority    TicketPriority
  status      TicketStatus   @default(OPEN)
  title       String
  description String?
  rootCause   String?
  resolution  String?
  slaDeadline DateTime
  openedAt    DateTime       @default(now())
  resolvedAt  DateTime?
  closedAt    DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  actions TicketAction[]

  @@index([assignedTo])
  @@index([status])
  @@index([customerId])
}

model TicketAction {
  id        String           @id @default(uuid())
  ticketId  String
  ticket    Ticket           @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  userId    String
  user      User             @relation("TicketActionAuthor", fields: [userId], references: [id])
  type      TicketActionType
  body      String?
  createdAt DateTime         @default(now())

  @@index([ticketId])
}
```

- [ ] **Step 2: Add reverse relations to the existing User model**

In `prisma/schema.prisma`, find the `model User { ... }` block and add two relation fields **inside** it (after `passwordResetTokens PasswordResetToken[]`):

```prisma
  assignedTickets Ticket[]       @relation("TicketAssignee")
  ticketActions   TicketAction[] @relation("TicketActionAuthor")
```

- [ ] **Step 3: Validate schema**

```bash
npx prisma validate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Ticket and TicketAction models to schema"
```

---

### Task 6: Add supporting models (ActivityLog, PlatformCredential) and vnocRole on Profile

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append ActivityLog and PlatformCredential models**

```prisma
model ActivityLog {
  id        String    @id @default(uuid())
  type      String
  platform  Platform?
  userId    String?
  alertId   String?
  ticketId  String?
  message   String
  meta      Json?
  createdAt DateTime  @default(now())

  @@index([alertId])
  @@index([ticketId])
  @@index([createdAt])
}

model PlatformCredential {
  id            String   @id @default(uuid())
  platform      Platform @unique
  clientId      String?
  clientSecret  String?
  apiKey        String?
  webhookSecret String?
  config        Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

- [ ] **Step 2: Add vnocRole to the existing Profile model**

In `prisma/schema.prisma`, find `model Profile { ... }` and add `vnocRole VnocRole?` after `avatarUrl String?`:

```prisma
model Profile {
  id        String    @id @default(uuid())
  userId    String    @unique
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  firstName String
  lastName  String
  phone     String?
  avatarUrl String?
  vnocRole  VnocRole?
  updatedAt DateTime  @updatedAt
}
```

- [ ] **Step 3: Validate schema**

```bash
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid!`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add ActivityLog, PlatformCredential; add vnocRole to Profile"
```

---

### Task 7: Run migration and generate Prisma client

**Files:**
- None created — this task runs CLI commands only.

- [ ] **Step 1: Create and apply the migration**

```bash
npx prisma migrate dev --name vnoc-phase1-data-model
```

Expected: Prisma prints migration created and applied. If prompted about resetting the database in dev, type `y`. The migration file is created under `prisma/migrations/`.

- [ ] **Step 2: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Restart the TypeScript language server**

In VS Code: `Cmd+Shift+P` → `TypeScript: Restart TypeScript Server`. This ensures editor picks up the new generated types.

- [ ] **Step 4: Commit the migration files**

```bash
git add prisma/migrations/ prisma/schema.prisma
git commit -m "feat: apply vnoc-phase1-data-model migration"
```

---

### Task 8: Extend NextAuth JWT with vnocRole

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Write the failing test for the JWT callback**

Create `src/test/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing auth
vi.mock('@/lib/prisma', () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'

describe('NextAuth jwt callback', () => {
  const jwtCallback = authOptions.callbacks!.jwt as Function

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores vnocRole in token when user signs in', async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      firstName: 'Test',
      lastName: 'User',
      phone: null,
      avatarUrl: null,
      vnocRole: 'TIER2',
      updatedAt: new Date(),
    })

    const result = await jwtCallback({
      token: {},
      user: { id: 'user-1', email: 'test@test.com', isSuperAdmin: false },
    })

    expect(result.vnocRole).toBe('TIER2')
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { vnocRole: true },
    })
  })

  it('stores null vnocRole when user has no profile', async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null)

    const result = await jwtCallback({
      token: {},
      user: { id: 'user-2', email: 'other@test.com', isSuperAdmin: false },
    })

    expect(result.vnocRole).toBeNull()
  })

  it('does not query profile when user is not present (token refresh)', async () => {
    const result = await jwtCallback({
      token: { id: 'user-1', isSuperAdmin: false, vnocRole: 'TIER1' },
    })

    expect(prisma.profile.findUnique).not.toHaveBeenCalled()
    expect(result.vnocRole).toBe('TIER1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/test/auth.test.ts
```

Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'jwt')` or similar (vnocRole not yet in JWT callback).

- [ ] **Step 3: Update src/types/next-auth.d.ts to include vnocRole**

Replace the entire file content:

```typescript
import { DefaultSession } from "next-auth";
import { VnocRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
      vnocRole: VnocRole | null;
    } & DefaultSession["user"];
  }

  interface User {
    isSuperAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isSuperAdmin: boolean;
    vnocRole: VnocRole | null;
  }
}
```

- [ ] **Step 4: Update src/lib/auth.ts to fetch vnocRole in jwt callback**

Replace the `callbacks` block in `src/lib/auth.ts`:

```typescript
import NextAuth, { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return user;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isSuperAdmin = user.isSuperAdmin;
        const profile = await prisma.profile.findUnique({
          where: { userId: user.id },
          select: { vnocRole: true },
        });
        token.vnocRole = profile?.vnocRole ?? null;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isSuperAdmin = token.isSuperAdmin as boolean;
        session.user.vnocRole = token.vnocRole;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run test:run -- src/test/auth.test.ts
```

Expected:
```
✓ stores vnocRole in token when user signs in
✓ stores null vnocRole when user has no profile
✓ does not query profile when user is not present (token refresh)
Test Files  1 passed
```

- [ ] **Step 6: Commit**

```bash
git add src/types/next-auth.d.ts src/lib/auth.ts src/test/auth.test.ts
git commit -m "feat: extend NextAuth JWT with vnocRole from Profile"
```

---

### Task 9: Seed test data

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Read current prisma/seed.ts to understand existing seed structure**

Run: `cat prisma/seed.ts`

- [ ] **Step 2: Append VNOC seed data to prisma/seed.ts**

Add this block at the end of the main seed function (before the final `console.log`):

```typescript
import { PrismaClient, Platform, VnocRole } from '@prisma/client'

// --- VNOC test data ---

// PlatformCredentials (empty shells — real credentials set via admin UI)
await prisma.platformCredential.upsert({
  where: { platform: 'POLY_LENS' },
  create: {
    platform: 'POLY_LENS',
    config: { lastPolledAt: null },
  },
  update: {},
})

await prisma.platformCredential.upsert({
  where: { platform: 'YEALINK_YMCS' },
  create: {
    platform: 'YEALINK_YMCS',
    config: { lastPolledAt: null },
  },
  update: {},
})

// Test customer hierarchy
const customer = await prisma.customer.upsert({
  where: { id: 'seed-customer-1' },
  create: {
    id: 'seed-customer-1',
    name: 'Acme Corp',
  },
  update: { name: 'Acme Corp' },
})

const site = await prisma.site.upsert({
  where: { id: 'seed-site-1' },
  create: {
    id: 'seed-site-1',
    customerId: customer.id,
    name: 'HQ - Chicago',
    address: '123 Main St',
    city: 'Chicago',
    state: 'IL',
    lat: 41.8781,
    lng: -87.6298,
  },
  update: { name: 'HQ - Chicago' },
})

const room = await prisma.room.upsert({
  where: { id: 'seed-room-1' },
  create: {
    id: 'seed-room-1',
    siteId: site.id,
    name: 'Conference Room A',
  },
  update: { name: 'Conference Room A' },
})

await prisma.device.upsert({
  where: { platform_platformId: { platform: 'POLY_LENS', platformId: 'poly-seed-device-1' } },
  create: {
    roomId: room.id,
    platform: 'POLY_LENS',
    platformId: 'poly-seed-device-1',
    name: 'Poly Studio X50',
    model: 'Studio X50',
    firmware: '3.14.1',
    status: 'online',
    lastSeenAt: new Date(),
    rawPayload: { seeded: true },
  },
  update: { status: 'online', lastSeenAt: new Date() },
})

console.log('✅ VNOC seed data created')
```

Note: If the existing `seed.ts` does not already import `PrismaClient`, confirm the import at the top of the file. The seed runner (`tsx ./prisma/seed.ts`) provides its own execution context.

- [ ] **Step 3: Run the seed**

```bash
npx prisma db seed
```

Expected: Seed runs without errors and prints `✅ VNOC seed data created`.

- [ ] **Step 4: Verify data in DB**

```bash
npx prisma studio
```

Open `Customer`, `Site`, `Room`, `Device`, `PlatformCredential` tables and confirm records exist.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore: add VNOC test seed data (customer hierarchy, platform credentials)"
```

---

## Completion Check

After all tasks:

- [ ] `npm run test:run` passes all tests
- [ ] `npx prisma validate` shows no schema errors
- [ ] `npx prisma studio` shows Customer, Site, Room, Device, PlatformCredential records
- [ ] `npm run build` compiles without TypeScript errors

**Next plan:** `2026-05-27-vnoc-02-dashboard-shell.md` — sidebar nav update, skeleton route pages, SSE endpoint.
