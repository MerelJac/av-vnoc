# Testing Plan — Call One VNOC

How this app is verified, with which tool, and when to run each layer.
CI (`.github/workflows/ci.yml`) runs the static + unit layers on every PR;
the full pyramid should be green before any production deploy.

## The layers

| # | Layer | Tool | Command | What it catches |
|---|-------|------|---------|-----------------|
| 1 | Types | TypeScript | `npx tsc --noEmit` | Contract drift, bad Prisma queries, route param typos |
| 2 | Lint | ESLint 9 | `npm run lint` | Unused code, unsafe patterns, React pitfalls |
| 3 | Unit + integration | Vitest (jsdom) | `npx vitest run` | Adapters, correlation engine, API route auth/validation, UI components |
| 4 | Coverage floor | Vitest + v8 | `npm run coverage` | Regression below 80/68/80/80 (statements/branches/functions/lines) |
| 5 | E2E | Playwright (Chromium) | `npx playwright test` | Real login, navigation, console/network errors, operator flows |
| 6 | Production build | Next.js | `npm run build` | Server/client boundary violations, build-time env issues |
| 7 | Live smoke | tsx scripts | `npx tsx scripts/smoke-poly-lens.ts` / `smoke-yealink.ts` | Real vendor API contract drift (needs real credentials) |

## What lives where

- `src/test/**` — Vitest suites. API route tests mock `next-auth` + `@/lib/prisma`
  and assert: 401/403 gates, input validation, query shape, and that secrets
  never leave the server. Integration adapters (`poly-lens`, `yealink`,
  `logitech-sync`, `ymcs-client`, `logi-sync-client`) are tested against
  mocked HTTP with real request-shape assertions.
- `src/test/correlation.test.ts` — the alert pipeline: dedup, device lookup
  (including the YMCS MAC-address fallback), suppression, grouping,
  SLA/priority routing from AppConfig.
- `tests/e2e/**` — Playwright specs. `playwright.config.ts` boots `npm run dev`
  automatically. Seeded login comes from `E2E_EMAIL` / `E2E_PASSWORD`
  (defaults match `prisma/seed.ts`).
  - `smoke-routes.spec.ts` — every main route loads with zero console errors
  - `auth.spec.ts` — login / bad password / logout / route lockout
  - `ticket-flow.spec.ts` — queue → detail → add note (skips without seeded tickets)
  - `customer-site-management.spec.ts` — customer/site CRUD
  - `sidebar-layout.spec.ts` — layout regression
- `scripts/smoke-*.ts` — manual vendor API verification with real credentials
  (gitignored). Run after entering credentials in Settings and before trusting
  a new integration in production.

## Release gate (run all of it)

```bash
npx tsc --noEmit && npm run lint && npm run coverage && npm run build && npx playwright test
```

## Conventions

- TDD for all new behavior: the test exists and fails before the implementation.
- Route tests assert authorization *before* effects (`expect(prisma.x).not.toHaveBeenCalled()` on 401/403).
- E2E specs must not hard-depend on data volume — skip gracefully (see
  `ticket-flow.spec.ts`) rather than flake.
- Webhook handlers are tested for: signature/token rejection, dedup, batch
  handling, and that processing errors are recorded on `WebhookEvent` rather
  than failing the response.
