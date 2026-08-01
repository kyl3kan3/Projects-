# LaunchList

**Waitlist + launch-page builder with viral referral mechanics — turn "coming soon" into a growth loop.**

---

## The Problem

Every product launch starts with the same 48 hours of yak-shaving: a landing page, an email capture form, somewhere to store signups, a referral mechanism if you're ambitious, and an email tool to actually talk to the list. Founders either burn launch momentum wiring Mailchimp to Carrd to a spreadsheet, or pay for four tools to serve one page.

The referral part matters most and is built least: waitlists that reward sharing ("refer 3 friends, move up 500 spots") consistently multiply signup rates — Robinhood's million-person waitlist made this famous — but building position tracking, unique links, fraud filtering, and reward tiers is a real project, so most launches skip it and leave growth on the table.

## Target User

- **Primary:** indie hackers and startup founders pre-launch (a new audience is born every day — this market never saturates and never churns for a bad reason: they either launched or didn't).
- **Secondary:** marketing teams launching new features/products at existing companies; newsletter creators gating early access.
- **Not targeting:** enterprise product marketing (procurement, SSO demands) at MVP.

## Market & Profitability

- Realistic outcome: **$3k–$25k MRR**. This is a classic micro-SaaS: small ACV, huge top-of-funnel, near-zero marginal cost.
- The structural churn (people launch and leave) is offset by the structural funnel: every hosted waitlist page is an ad for LaunchList in front of exactly the right audience (founders looking at other founders' launches).
- Competitors validate pricing: Prefinery charges $49–$419/mo; getwaitlist.com free tier feeds a $50/mo paid tier. There's room for a better-designed product at indie prices.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 250 signups, 1 list, LaunchList badge |
| Growth | $19/mo | 5,000 signups, custom domain, remove badge, email blasts |
| Pro | $49/mo | Unlimited signups, A/B tests, API + webhooks, Zapier, priority support |

Free-tier badge on hosted pages is the acquisition engine — it must stay.

## MVP Features

- [ ] Page builder: templates (hero + form + social proof), theme controls, OG-image generation for link previews
- [ ] Hosted page (yourproduct.launchlist.app) + custom domain on Growth
- [ ] Embed widget (script tag / React snippet) for existing sites
- [ ] Referral engine: unique share links, position-in-line, "skip the line" mechanics, milestone rewards (e.g., 3 referrals = early access tier)
- [ ] Anti-fraud: disposable-email blocking, IP/device duplicate heuristics, manual review queue
- [ ] Signup dashboard: sources, referral leaderboard, conversion funnel
- [ ] Email blasts to the list (announcements, launch-day) with unsubscribe handling
- [ ] Export: CSV, webhook on signup, Zapier (Pro)

## Differentiation

1. **Referral mechanics as the default, not an add-on** — position, skip-the-line, and milestone rewards work out of the box in every template.
2. **Design quality:** launch pages are status symbols on founder Twitter/X; templates that screenshot beautifully get shared.
3. **Indie pricing** against Prefinery's $49+ entry, with a genuinely useful free tier.

## Go-to-Market

- The product is its own channel: free-tier badge + "Powered by LaunchList" on thousands of launch pages viewed by founders.
- Product Hunt (the audience literally lives there) + launch-adjacent communities (Indie Hackers, r/SideProject, WIP).
- SEO: "waitlist template", "product launch page", "Prefinery alternative" pages; free tools (waitlist ROI calculator, launch checklist).
- Twitter/X build-in-public: sharing real referral-curve data from launches using the platform.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| getwaitlist.com | Free–$50/mo | Utilitarian design, weak page builder |
| Prefinery | $49–$419/mo | Priced for funded startups, dated UX |
| LaunchRock | Free–$5/mo | Effectively abandoned, ad-supported |
| Carrd + ConvertKit DIY | ~$28/mo combined | No referral engine, manual wiring |

## Key Risks

- **Naming collision:** "LaunchList" is used by existing products (launchlist.co and similar). Validate trademark availability and be ready to rename before public launch — the scaffold treats the name as a placeholder.
- **Structural churn:** users launch and cancel. Counters: multi-list accounts (serial builders), post-launch mode (convert waitlist to newsletter/changelog audience), annual plans discounted hard.
- **Email deliverability:** blasts from shared infrastructure risk spam-foldering; require domain verification (DKIM/SPF) for custom-domain senders and isolate sending pools by reputation.
- **Fraud/gaming:** referral rewards invite fake signups; heuristics + review queue at MVP, device fingerprinting only if abuse warrants (privacy trade-off).

---

## Setup

Requirements: Node 22, Postgres 16, and nothing else. Redis is optional (see
below).

```bash
cp .env.example .env.local          # fill in DATABASE_URL and AUTH_SECRET
npm install
npm run db:migrate                  # applies drizzle/ against DATABASE_URL
npm run dev                         # http://localhost:3015
```

Then sign up at `/signup`, name your product, and your launch page is live at
`/l/{slug}`.

**Without `RESEND_API_KEY` nobody can complete a signup** — confirmation emails
are written to the server log instead of being delivered, and the link in that
log entry is how you confirm one by hand. Every dashboard screen that depends on
sending says so.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Builds the embed widget, then starts Next on 3015 |
| `npm run build` | Widget bundle + production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Domain-logic unit tests (node:test via tsx) |
| `npm run db:generate` | New migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run worker` | Long-lived blast/webhook worker (needs `REDIS_URL`) |

### Background work

Blast sending and webhook delivery need something to run them. Two options,
pick one:

- **Cron route** (`/api/cron/tick`) — the Vercel default. `vercel.json`
  schedules it every 5 minutes; it does the work inline with a 45-second budget
  and a resumable cursor, so an interrupted blast continues rather than
  restarting. Requires `CRON_SECRET`. Note that Vercel's **Hobby plan runs cron
  only once per day** — a launch-day blast wants Pro, or the worker below.
- **Worker** (`npm run worker`) — for a host that can run a process. Same work
  on a 5-second loop. It takes a Redis lock per cycle, so if you run both the
  worker and the cron route they cannot double-send; disable the cron anyway.

### Hosted page addresses

A launch page is reachable three ways, all serving the same page:

1. `{APP_URL}/l/{slug}` — always works, no DNS needed.
2. `{slug}.{NEXT_PUBLIC_PAGES_DOMAIN}` — needs a wildcard DNS record and a
   wildcard domain on the host.
3. A founder's own domain (Growth) — CNAME to the app, then the domain has to be
   attached at the host for TLS. Until it is verified in list settings the page
   keeps serving from address 1, so nothing breaks while DNS propagates.
