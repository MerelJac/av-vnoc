# VNOC — Proposal Audit & TODO

Audited 2026-06-10 against `docs/CallOne_VNOC_Proposal.docx` (May 2026).
Refreshed 2026-06-16: tenancy, role-aware landing, and SLA early-warning shipped; added a
code-health section from the full-project review.

## Proposal scorecard

### Met ✅
- **Single pane of glass** — dashboard with all six mockup panels; KPI strip carries every proposal tile (critical alerts, open tickets, % rooms online, 24h MTTR, 30-day SLA compliance) plus SLA-at-risk.
- **Integration platform (Layer 2)** — webhook ingestion (Yealink) + cron polling, correlation engine (dedup, 60s flap auto-close, room/site outage grouping), Customer→Site→Room→Device asset DB, auth + full audit trail (ActivityLog/TicketAction).
- **Poly Lens & Yealink YMCS** (Phase 2) — devices, alerts, webhooks, reboot.
- **Service workflow steps 1–7** — detection → ingestion → correlation → self-heal auto-close → auto-ticket with playbook priority + SLA timers (admin-configurable) → Tier-1 queue triage → remote reboot → escalate → closure with root cause.
- **Roles** — TIER1/TIER2/MANAGER + super-admin, tier-gated ticket actions, manager KPI/SLA reporting page + monthly SLA email.
- **Per-customer tenancy** — tech↔customer `CustomerAssignment` model + scoping helpers (`src/lib/tenancy.ts`) applied across alerts/tickets/devices/rooms/customers. Super-admins/MANAGERs and unassigned users are unrestricted (backwards-compatible default).
- **Role-aware landing** — TIER1 → `/tickets?queue=mine`, MANAGER → `/reports`, super-admin/other → `/dashboard` (`src/lib/landing.ts`).
- **SLA breach early-warning** — `runSlaWarningSweep` (alerts cron) notifies managers as tickets approach their SLA deadline.
- **Ticket system mapped 1:1 to ServiceNow fields** for the Phase-3 swap.
- **Logitech Sync** (Phase 3 item) — polling adapter live (reads place-embedded devices); reboot pending vendor OpenAPI.
- **Utelogy** (Phase 3 item) — monitoring adapter scaffold live, pending U-API credential verification.

### Partial ⚠️
- **Room control panel** — room/device status only; no live control actions (source switching, presets, reboot-via-Utelogy) until U-API docs/creds arrive.
- **Remote remediation breadth** — reboot + portal launch only; `FIRMWARE_PUSH` / `CONFIG_RESTORE` action types exist in the data model but aren't wired to vendor APIs.
- **Webhook coverage** — only Yealink YMCS has a push endpoint; Poly Lens, Logitech Sync, and Utelogy are polling-only via the alerts cron.

### Not yet built ❌
- **Neat Pulse adapter** (Phase 3).
- **Cisco Control Hub adapter** (Phase 3).
- **ServiceNow integration** (Phase 3 — blocked on tenant decision).
- **Customer-facing reporting portal** (Phase 4).
- **Second wave** — Crestron XiO, Q-SYS Reflect, Biamp SageVue (explicitly later).

### Phase status
| Phase | Proposal scope | Status |
|---|---|---|
| 1 Foundation | Asset/site DB, dashboard shell | ✅ done (native ticketing instead of ServiceNow instance) |
| 2 First integrations | Poly + YMCS live, alerts + tickets | ✅ done |
| 3 Full integration | Neat, Logitech, Cisco, Utelogy, room control, pilot | ~55% — Logitech + Utelogy in, tenancy + role landing + SLA warnings shipped; Neat, Cisco, room control, ServiceNow, pilot pending |
| 4 Production rollout | Customer migration, staffing, customer portal | not started |

Note: proposal assumed Azure hosting; built on AWS (Amplify + Neon + SES + Lambda). Decision made — update the doc when revising.

---

## TODO — Claude (code)

Unblocked-by-credentials (first, when Alex provides them):
1. Run smoke scripts (Poly, YMCS, Utelogy) and Logitech against live APIs; correct field mappings in the isolated `fetchDevicesRaw`/`TODO(verify)` functions.
2. Implement Logitech reboot + Utelogy control actions once OpenAPI/U-API docs confirm endpoints.

Independent of credentials:
3. Neat Pulse adapter (REST + webhooks per proposal table).
4. Cisco Control Hub adapter (REST + xAPI).
5. Room control panel UI backed by Utelogy actions (after item 2).
6. Wire `FIRMWARE_PUSH` / `CONFIG_RESTORE` ticket actions to vendor APIs (the action types already exist in the schema but are inert), or drop them from the action surface until supported.
7. Add webhook endpoints for push-capable vendors (Poly Lens, Logitech Sync) to reduce reliance on the polling cron.
8. ServiceNow adapter behind the existing ticket interface (after tenant decision).
9. Customer-facing reporting portal (Phase 4; read-only per-customer SLA/health views).

Code health / tech debt (from the 2026-06-16 review):
10. Remove vestigial template code carried over from the financial-app bootstrap: the `// removed` stubs (`src/lib/{bc,bc-local,invoice-pdf,quote-pdf,buildFinancialReportRows}.ts`, `src/lib/utils/{vertex,invoice-tax}.ts`, `src/scripts/emailMonthlyInvoiceReport.ts`), the unused `src/lib/utils/htmlToPdf.tsx` + `@react-pdf/renderer` dependency, and the dead `VERTEX_*` env vars (in `.env.local` and `amplify.yml`).
11. Replace the `console.error` in `/api/cron/daily` with the structured `logger` (`logError`) for pipeline-log consistency.

Done since the last audit (2026-06-10): per-customer tenancy, role-aware landing redirects, SLA breach early-warning sweep, Logitech Sync API alignment.

## TODO — Alex (operational / decisions)

Now:
1. Provide API credentials: Poly Lens (clientId/secret/tenantId), YMCS (clientId/secret/region), Logitech (orgId + cert/key PEM from Sync Portal), Utelogy (instance baseUrl + API key) → enter in Settings → run the smoke scripts with Claude.
2. Register the YMCS webhook in the YMCS admin portal → save its verification token in Settings.
3. Confirm the EventBridge schedule: a ~5-minute rule for `/api/cron/alerts` (proposal/spec wants tight polling) in addition to the daily/monthly rules. (Amplify already runs `migrate deploy` on deploy.)
4. Download the Logitech Sync OpenAPI spec from the Sync Portal (Settings → Sync Cloud API tab) and the Utelogy U-API docs for Claude. *(2026-06-10: the Sync quick-start guide was fetched and verified — auth/mTLS, base URL, and `/places` are confirmed and the adapter reads place-embedded devices; the OpenAPI spec is still needed for the device-command/reboot endpoints. See docs/superpowers/specs/2026-06-10-logitech-sync-api-verification.md.)*

Decisions the proposal flags as "need to land early":
5. ServiceNow instance: net-new tenant vs shared with IT ops (proposal recommends net-new) — gates Claude TODO #8.
6. Utelogy licensing: per-room vs enterprise.
7. Pilot customer selection (1–2 customers) and stakeholder review of the proposal.
8. VNOC staffing plan (proposal: 1× Tier 1 + shared Tier 2 for first ~50 customers).

Optional:
9. Sentry DSN (or similar) if external error tracking is wanted on top of the structured JSON logs.
10. Verify SES sender for the monthly manager SLA report emails in production.
