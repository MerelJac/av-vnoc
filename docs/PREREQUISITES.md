# VNOC Prerequisites Tracker

Everything needed before and during development. Check off items as collected.

---

## Phase 1 + 2 Blockers (needed before dev starts)

### Database
- [ ] **Neon PostgreSQL connection string** → paste into `DATABASE_URL` in `.env.local`
  - Neon project URL, database name, user, password

### App Secrets
- [ ] **NEXTAUTH_SECRET** → run `openssl rand -base64 32` and paste into `.env.local`
- [ ] **INVITE_PASS** → choose a static password for invited users' first login
- [ ] **CRON_SECRET** → run `openssl rand -base64 32` and paste into `.env.local`

---

## Poly Lens Integration

- [ ] **Client ID** → `POLY_LENS_CLIENT_ID`
- [ ] **Client Secret** → `POLY_LENS_CLIENT_SECRET`
- [ ] **Webhook Secret** → `POLY_LENS_WEBHOOK_SECRET`
- [ ] **API base URL confirmed** — is `https://api.lens.poly.com` correct, or different for your tenant?
- [ ] **Webhook registered** — register `https://<your-domain>/api/webhooks/poly-lens` in the Poly Lens portal
- [ ] **API docs** — link or PDF for the Poly Lens REST API reference
- [ ] **Webhook payload samples** — copy/paste or screenshot of what a device-offline event looks like in Poly Lens
- [ ] **Webhook payload samples** — camera fault, firmware update, call quality alert
- [ ] **Test account** — a Poly Lens account with at least one enrolled test device

---

## Yealink YMCS Integration

- [ ] **API Key** → `YEALINK_API_KEY`
- [ ] **Webhook Secret** → `YEALINK_WEBHOOK_SECRET`
- [ ] **API base URL confirmed** — is `https://open.ymcs.yealink.com` correct?
- [ ] **Webhook registered** — register `https://<your-domain>/api/webhooks/yealink` in the YMCS portal
- [ ] **API docs** — link or PDF for the Yealink YMCS REST API reference
- [ ] **Webhook payload samples** — device offline, registration failure, alarm events
- [ ] **Test account** — a YMCS account with at least one enrolled test device

---

## AWS SES (Email)

- [ ] **Access Key ID** → `SES_ACCESS_KEY_ID`
- [ ] **Secret Access Key** → `SES_SECRET_ACCESS_KEY`
- [ ] **Region** → `SES_REGION` (e.g. `us-east-1`)
- [ ] **From address** → `SES_FROM_ADDRESS` — must be a verified sender in SES

---

## Public Webhook URL

- [ ] **Production domain** confirmed (for registering webhooks with vendors)
  - Dev: set up `ngrok` or similar tunnel → `ngrok http 3001`
  - Prod: confirm the Amplify app URL or custom domain

---

## Seed / Reference Data

- [ ] **Customer list** — names of the first ≤10 managed customers to seed into the DB
- [ ] **Site list per customer** — site name, street address, city, state
  - Lat/lng needed for the site map — can use Google Maps or a geocoding API later if not available now
- [ ] **Room names per site** — e.g. "Boardroom 14", "Conference 4B", "Team Hall"
- [ ] **SLA targets confirmed**:
  - P1 (Critical) — assumed **1 hour** response. Correct?
  - P2 (High) — assumed **4 hours**. Correct?
  - P3 (Medium) — assumed **8 hours**. Correct?
  - P4 (Low) — assumed **24 hours**. Correct?

---

## Design Decisions (answer before Phase 2 dev starts)

- [ ] **vnocRole assignment** — who gets TIER1 / TIER2 / MANAGER at launch? List users and their roles.
- [ ] **Business hours definition** — for P1 priority playbook (proposal says "during business hours at executive sites"). What hours, what timezone?
- [ ] **Executive sites** — which customer sites are flagged as executive (P1 default)?

---

## Phase 3+ (collect during Phase 2, not blocking now)

- [ ] **ServiceNow tenant decision** — net-new VNOC instance or shared with IT ops?
- [ ] **ServiceNow credentials** — client ID, client secret, instance URL
- [ ] **Utelogy credentials** — API key, base URL, per-room licensing model confirmed
- [ ] **Neat Pulse API credentials**
- [ ] **Logitech Sync API credentials**
- [ ] **Cisco Control Hub API credentials** (OAuth 2.0, requires Webex org admin)
- [ ] **Crestron XiO Cloud credentials**
