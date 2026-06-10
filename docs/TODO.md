# VNOC — Proposal Audit & TODO

Audited 2026-06-10 against `docs/CallOne_VNOC_Proposal.docx` (May 2026).

## Proposal scorecard

### Met ✅
- **Single pane of glass** — dashboard with all six mockup panels; KPI strip carries every proposal tile (critical alerts, open tickets, % rooms online, 24h MTTR, 30-day SLA compliance) plus SLA-at-risk.
- **Integration platform (Layer 2)** — webhook ingestion + cron polling, correlation engine (dedup, 60s flap auto-close, room/site outage grouping), Customer→Site→Room→Device asset DB, auth + full audit trail (ActivityLog/TicketAction).
- **Poly Lens & Yealink YMCS** (Phase 2) — devices, alerts, webhooks, reboot.
- **Service workflow steps 1–7** — detection → ingestion → correlation → self-heal auto-close → auto-ticket with playbook priority + SLA timers (admin-configurable) → Tier-1 queue triage → remote reboot → escalate → closure with root cause.
- **Roles** — TIER1/TIER2/MANAGER + super-admin, tier-gated ticket actions, manager KPI/SLA reporting page + monthly SLA email.
- **Ticket system mapped 1:1 to ServiceNow fields** for the Phase-3 swap.
- **Logitech Sync** (Phase 3 item) — polling adapter live; reboot pending vendor OpenAPI.
- **Utelogy** (Phase 3 item) — monitoring adapter scaffold live, pending U-API credential verification.

### Partial ⚠️
- **Room control panel** — room/device status only; no live control actions (source switching, presets, reboot-via-Utelogy) until U-API docs/creds arrive.
- **Remote remediation breadth** — reboot + portal launch only; firmware push / config restore action types exist in the data model but aren't wired to vendor APIs.
- **SLA guardrails** — at-risk counts surface on the KPI strip and reports page, but there's no automatic manager notification as breach approaches.
- **Role-aware landing views** — all roles land on /dashboard (proposal: Tier 1 → My Queue, Manager → executive overview).

### Not yet built ❌
- **Per-customer tenancy** — proposal: "technicians only see customers they support." No tech↔customer assignment/scoping exists; everyone sees everything.
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
| 3 Full integration | Neat, Logitech, Cisco, Utelogy, room control, pilot | ~50% — Logitech + Utelogy in; Neat, Cisco, room control, ServiceNow, pilot pending |
| 4 Production rollout | Customer migration, staffing, customer portal | not started |

Note: proposal assumed Azure hosting; built on AWS (Amplify + Neon + SES + Lambda). Decision made — update the doc when revising.

---

## TODO — Claude (code)

Unblocked-by-credentials (first, when Alex provides them):
1. Run smoke scripts (Poly, YMCS, Utelogy) and Logitech against live APIs; correct field mappings in the isolated `fetchDevicesRaw`/`TODO(verify)` functions.
2. Implement Logitech reboot + Utelogy control actions once OpenAPI/U-API docs confirm endpoints.

Independent of credentials:
3. Per-customer tenancy: tech↔customer assignment model + scoping filters on alerts/tickets/devices/rooms queries (biggest unmet proposal commitment).
4. Neat Pulse adapter (REST + webhooks per proposal table).
5. Cisco Control Hub adapter (REST + xAPI).
6. Role-aware landing redirects (TIER1 → /tickets?queue=mine, MANAGER → /reports).
7. SLA breach early-warning: notify managers (SES email and/or SSE toast) when tickets enter the at-risk window.
8. Room control panel UI backed by Utelogy actions (after item 2).
9. ServiceNow adapter behind the existing ticket interface (after tenant decision).
10. Customer-facing reporting portal (Phase 4; read-only per-customer SLA/health views).

## TODO — Alex (operational / decisions)

Now:
1. Provide API credentials: Poly Lens (clientId/secret/tenantId), YMCS (clientId/secret/region), Logitech (orgId + cert/key PEM from Sync Portal), Utelogy (instance baseUrl + API key) → enter in Settings → run the smoke scripts with Claude.
2. Register the YMCS webhook in the YMCS admin portal → save its verification token in Settings.
3. Apply the pending DB migration: deploy (Amplify now runs `migrate deploy`) or run `npx prisma migrate deploy` manually.
4. Redeploy the cron Lambda (script now includes `/api/cron/alerts`) and add a 5-minute EventBridge rule for it — the proposal/spec wants tight polling, current schedule is daily.
5. Download the Logitech Sync OpenAPI spec from the Sync Portal and the Utelogy U-API docs for Claude.

Decisions the proposal flags as "need to land early":
6. ServiceNow instance: net-new tenant vs shared with IT ops (proposal recommends net-new) — gates TODO #9.
7. Utelogy licensing: per-room vs enterprise.
8. Pilot customer selection (1–2 customers) and stakeholder review of the proposal.
9. VNOC staffing plan (proposal: 1× Tier 1 + shared Tier 2 for first ~50 customers).

Optional:
10. Sentry DSN (or similar) if external error tracking is wanted on top of the structured JSON logs.
11. Verify SES sender for the monthly manager SLA report emails in production.
