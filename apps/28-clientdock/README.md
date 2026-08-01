# ClientDock

**A white-label client portal for agencies and freelancers: one branded link where clients see status, files, approvals, and invoices — instead of asking you by email.**

---

## The Problem

Agencies and freelancers run client work across Slack, email threads, Google Drive, Figma, and an invoicing tool — and the client sees none of it coherently. The result is the most expensive activity in service businesses: **status communication.** "Where are we on X?" emails, weekly update calls that exist only for reassurance, files re-sent five times, approvals lost in inboxes.

Client-portal tools exist and are growing fast (Copilot at $29+/seat, SuiteDash's kitchen sink, Moxo's enterprise pricing) but the sweet spot — a genuinely beautiful, dead-simple portal an agency can brand as its own in 10 minutes — keeps being missed: incumbents either bloat into all-in-one business OSes or price per *internal* seat in a way that punishes lean agencies.

## Target User

- **Primary:** digital agencies (2–25 people: marketing, design, dev shops) and productized-service freelancers with 3–30 concurrent clients.
- **Secondary:** accountants/bookkeepers, consultants, coaches — anyone with recurring client relationships and deliverables.
- **Not targeting:** enterprise PSA (resource planning, time tracking) — that's a different product.

## Market & Profitability

- Validated hard and recently: Copilot (portal-first, agency-focused) raised on strong growth; SuiteDash/Clinked/Moxo sustain real businesses; "client portal" is a rising search category as agencies professionalize.
- Realistic outcome: **$10k–$60k MRR.** Agencies pay for anything that makes them look bigger than they are, and the portal is literally their brand's front door — high perceived value, low churn once clients are trained to use it.
- Pricing power comes from white-labeling (charged as the premium feature everywhere) — offering it *earlier and cheaper* than incumbents is the wedge.
- Margins 95%+ (CRUD + file storage); the marginal cost is S3 storage.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Solo | $29/mo | 10 client portals, your logo/colors, custom domain |
| Agency | $79/mo | 50 portals, full white-label (no ClientDock anywhere), client-side e-approvals, Stripe invoicing embed |
| Studio | $149/mo | Unlimited portals, team roles, API/Zapier, client analytics |

Priced per *business*, not per internal seat — the anti-Copilot move agencies will notice.

## MVP Features

- [x] Portal builder: modules per client (status/timeline, files, approvals, messages, invoices, links to Figma/docs) toggled on/off
- [x] Branding: logo, colors, custom domain, from-your-domain email notifications — client never sees ClientDock (Agency+)
- [x] Magic-link client access (clients never create passwords — adoption lives or dies here)
- [x] Status/timeline module: phases with progress, "last updated" freshness stamp
- [x] File sharing with versioning + approval requests ("Approve v3?" with one-click approve/request-changes + audit trail)
- [x] Messages module (email-notified threads, so clients can just reply to email)
- [x] Stripe invoice embed (connect their Stripe; pay inside the portal)
- [x] Client-view-as preview; portal duplication from templates

## Differentiation

1. **White-label first, not last:** full de-branding at $79 where Copilot gates portal polish behind higher tiers and per-seat math. The agency's brand is the product being sold — respect that.
2. **Zero-friction client side:** magic links, email-reply-to-thread, no client accounts. Every portal tool dies on client adoption; this is the entire design center.
3. **Per-business pricing** that doesn't tax growing teams.

## Go-to-Market

- Agency communities: r/agency, r/webdev freelance threads, Dynamite Circle, agency-owner Facebook groups/newsletters (Agency Highway, etc.).
- The portal itself markets: "Powered by ClientDock" on Solo tier portals (removed at Agency — which is also the upgrade nudge).
- Templates as SEO: "client portal template for marketing agencies", "design-approval workflow" pages.
- Partnerships/integrations marketplace presence: Slack, Figma, QuickBooks listings.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Copilot | $29+/internal seat | Seat pricing scales badly; portal polish gated upward |
| SuiteDash | $19–99/mo | Kitchen-sink complexity, dated UX |
| Moxo | Enterprise pricing | Overkill and opaque for small agencies |
| Notion/Drive shared folders | Free | No branding, approvals, invoices, or freshness — looks cheap |

## Key Risks

- **Client adoption failure mode:** if clients don't log in, agencies churn; magic links + email-reply threading + freshness nudges attack it directly, and portal-view analytics prove usage to the agency.
- **Feature-breadth pressure:** every agency asks for one more module (time tracking! contracts!); hold the line at portal-surface modules and integrate outward instead.
- **Copilot's momentum:** they're well-funded and good; win the segment they price out and the white-label purists.
- **Custom-domain/email deliverability plumbing:** DKIM/SPF setup per agency domain must be wizard-smooth or support drowns.

---

## Setup

Node 20+ and a Postgres database are the only requirements.

```bash
cp .env.example .env.local     # then fill in the values described below
npm install
npm run db:migrate             # applies drizzle/ against DATABASE_URL
npm run dev                    # http://localhost:3028
```

Sign up, and the app puts you straight into building the first portal. Add a
client contact, press **Send the link** — with no `RESEND_API_KEY` configured the
invitation is logged to the console *and* shown to you on the page, so you can
open the portal as your own client without wiring up email first.

### What each variable is for

| Variable | Needed for | Without it |
|---|---|---|
| `DATABASE_URL` | everything | nothing runs |
| `AUTH_SECRET` | signing the agency session and the scoped portal sessions | nothing runs (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | magic links and email bodies | defaults to `http://localhost:3028` |
| `STORAGE_DRIVER` | file uploads: `db` (Postgres) or `local` (disk) | defaults to `db`, which is the only driver that works on Vercel |
| `RESEND_API_KEY` | actually sending notifications | every notification is logged in full and recorded as `logged`, never silently dropped |
| `EMAIL_FROM` | the fallback sender | defaults to a ClientDock address |
| `INBOUND_EMAIL_DOMAIN` / `INBOUND_WEBHOOK_SECRET` | clients replying to notification emails | `POST /api/inbound/email` returns 503 rather than accepting unauthenticated writes |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | our subscription billing and agencies' Connect invoicing | checkout refuses cleanly; invoices can still be recorded with a payment link pasted in |
| `CRON_SECRET` | the freshness-nudge tick | `/api/cron/tick` returns 503 rather than running unprotected |

### Scripts

```bash
npm run typecheck    # tsc --noEmit
npm test             # node:test via tsx
npm run build        # production build
npm run db:generate  # new migration from src/db/schema.ts
npm run worker       # the freshness-nudge tick on a loop, for self-hosting
```

### Deploying

Vercel + Neon, per the repo's `DEPLOYING.md`. Three app-specific notes:

- **Storage.** Keep `STORAGE_DRIVER=db` on Vercel — its filesystem is read-only.
  `src/lib/storage.ts` is one interface with two drivers; an S3/R2 driver drops in
  behind it without touching a caller. Uploads are capped at `MAX_UPLOAD_BYTES`
  (10MB default) because Postgres is not a CDN.
- **Scheduled work.** `vercel.json` registers `/api/cron/tick` daily, which is all
  Hobby allows and all this app needs — the freshness nudge is bucketed by ISO
  week, so the cadence of the check doesn't change the behaviour.
- **Custom domains.** Point the agency's `CNAME` at the deployment and add the
  hostname to the Vercel project. A hostname only ever serves portals after its
  CNAME has actually been observed (`Check the DNS now` in Settings).

### The security property this app is built around

A client portal must never leak another client's data. Two rules make that true,
and both are enforced in one place each:

1. **`src/lib/portal-access.ts`** resolves a viewer only from a signed source — a
   per-portal session cookie whose `portalId` claim matches, or an agency session
   whose workspace owns the portal (the view-as preview, which is read-only).
   Every read then uses `viewer.portalId`, a value that came out of a signature
   check rather than out of the URL.
2. Every id inside a portal is resolved as an `(id, portalId)` pair. Pasting
   another portal's file, approval, invoice or thread id returns *not found*,
   which is the same answer as for an id that never existed.

The agency side mirrors it: `requireOwnedPortal(workspaceId, portalId)` in
`src/lib/portals.ts` is the only way agency code resolves a portal.
