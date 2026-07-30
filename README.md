# Profitable App Scaffolds

A curated portfolio of **50 buildable, high-profit-potential software products** — each researched, specified, and scaffolded so it can be lifted out of this repo and built as a standalone project.

> **One is built, 49 are launchpads.** `apps/01-clipforge` is a complete working MVP; every other folder is a full product spec, market/profitability research, architecture, redline design spec, roadmap, and code scaffolding with stub files. Pick one, extract it, and start building.

## How to build every app at once

Every app in the portfolio compiles. `tools/build-all.sh` builds all of them and
prints a pass/fail table:

```bash
tools/setup-buildkit.sh     # one-time: install the shared toolchains
tools/build-all.sh          # build everything
tools/build-all.sh 31 57    # just the units matching 31 or 57
```

The apps stay self-contained, so building one on its own still works the usual
way — `cd apps/03-briefcast && npm install && npm run build`. See
[BUILDING.md](./BUILDING.md) for what "builds" means per stack (a full
`next build` for web, a typecheck for the Expo apps, and so on), why there is a
shared toolchain, and the known limitations.

## How to build one with an AI agent

Every app folder is designed to be handed directly to a coding agent (Claude Opus,
Claude Code, etc.) with zero outside context. Extract the folder, then point the
agent at **`BUILD.md`** — it contains the reading order, the non-negotiable craft
rules (no purple, no emoji, fonts must load, one rationed accent…), the build
order, and the definition of done. The folder carries its own copies of
`DESIGN_LANGUAGE.md` and `MARKETING_PLAYBOOK.md`, so the binding rules survive
extraction.

## How to extract an app into its own repo

Every app folder under `apps/` is fully self-contained (own `BUILD.md`, README, `.gitignore`, `.env.example`, config, and source tree). To spin one out:

```bash
# 1. Copy the folder out
cp -r apps/03-briefcast ~/dev/briefcast && cd ~/dev/briefcast

# 2. Make it a repo
git init && git add -A && git commit -m "Initial scaffold"

# 3. Push it wherever you like
git remote add origin git@github.com:you/briefcast.git
git push -u origin main
```

No app folder references files outside itself. See [SCAFFOLD_GUIDE.md](./SCAFFOLD_GUIDE.md) for the conventions every scaffold follows.

## The list, ranked

Ranked by a blend of: **proven willingness to pay, margin profile, realistic solo/small-team buildability, recurring-revenue strength, and distribution clarity** — based on 2025–2026 market data (RevenueCat/Adapty subscription reports, indie-hacker revenue benchmarks, micro-SaaS market analyses; sources in each app's README).

| # | App | Type | What it is | Monetization | Realistic revenue potential |
|---|-----|------|------------|--------------|------------------------------|
| 1 | [ClipForge](apps/01-clipforge) | Web SaaS | AI content repurposer: one long video/podcast → clips, shorts, posts, newsletter | $29–$99/mo subscription | $10k–$100k+ MRR |
| 2 | [Dunly](apps/02-dunly) | B2B SaaS | Failed-payment recovery & dunning for Stripe subscription businesses | % of recovered revenue or $49–$299/mo | $10k–$80k MRR, 80–90% margins |
| 3 | [Briefcast](apps/03-briefcast) | Web SaaS | AI meeting notetaker → action items → auto CRM sync | $19–$49/user/mo | $10k–$100k MRR |
| 4 | [LensCRM](apps/04-lenscrm) | Vertical SaaS | CRM + contracts + galleries + payments, purpose-built for photographers | $24–$60/mo | $5k–$50k MRR |
| 5 | [PulseWatch](apps/05-pulsewatch) | Dev SaaS | Uptime, cron-job & SSL monitoring with status pages, for indie devs | $9–$19/mo | $5k–$20k MRR |
| 6 | [VaultBack](apps/06-vaultback) | Dev SaaS | One-click automated backups for Supabase / Neon / PlanetScale | $15–$49/mo | $5k–$15k MRR |
| 7 | [MergeMate](apps/07-mergemate) | Dev tool | AI code-review GitHub App: bug catching + standards enforcement on every PR | $12/dev/mo | $10k–$50k MRR |
| 8 | [SubSage](apps/08-subsage) | Mobile app | Subscription tracker & bill manager (Utilities = highest-LTV app category) | Weekly sub w/ trial + annual | $10k–$100k MRR |
| 9 | [LumaShot](apps/09-lumashot) | Web app | AI professional headshot studio | One-time credit packs $19–$49 | $10k–$200k/mo (spiky, viral) |
| 10 | [Streakly](apps/10-streakly) | Mobile app | Habit tracker + focus timer (productivity; 77% monthly subs) | Weekly/monthly sub + lifetime | $5k–$60k MRR |
| 11 | [DriftOff](apps/11-driftoff) | Mobile app | Sleep sounds & wind-down routines (health/fitness; annual plans dominate) | Annual sub $39–$59/yr | $5k–$50k MRR |
| 12 | [PaperTrail](apps/12-papertrail) | Web SaaS | Invoices, proposals & e-sign contracts for freelancers | $12–$29/mo | $5k–$40k MRR |
| 13 | [InboxPilot](apps/13-inboxpilot) | Chrome extension | AI email drafting & reply assistant inside Gmail | $8–$20/mo | $3k–$30k MRR |
| 14 | [RankRadar](apps/14-rankradar) | Web SaaS | Keyword rank tracking + AI content briefs for SEO teams | $29–$99/mo | $10k–$80k MRR |
| 15 | [LaunchList](apps/15-launchlist) | Micro-SaaS | Waitlist + launch-page builder with viral referral mechanics | $19–$49/mo | $3k–$25k MRR |
| 16 | [ParseFlow](apps/16-parseflow) | API product | Document-parsing API: PDFs/invoices/receipts → structured JSON | Usage-based, ~$0.01/page | $5k–$50k MRR |
| 17 | [TrustBadge](apps/17-trustbadge) | Web SaaS | Social-proof & review widgets for e-commerce stores | $19–$79/mo | $5k–$40k MRR |
| 18 | [AnswerDesk](apps/18-answerdesk) | Web SaaS | Embeddable AI support chatbot trained on your docs/site | $39–$199/mo | $10k–$80k MRR |
| 19 | [NicheHub](apps/19-nichehub) | Website engine | Programmatic niche-directory engine (SEO traffic → listings/ads/affiliate) | Sponsored listings, ads, affiliate | $2k–$30k/mo per directory |
| 20 | [ShotStash](apps/20-shotstash) | Desktop app | Screenshot manager with local OCR search (privacy-first utility) | One-time $29 + Pro subscription | $3k–$25k MRR |
| 21 | [LingoLoop](apps/21-lingoloop) | Mobile app | AI voice conversation tutor for language learners (education = top-grossing category) | $14.99/mo, $79.99/yr w/ trial | $10k–$100k MRR |
| 22 | [CallCatch](apps/22-callcatch) | B2B SaaS | AI receptionist + missed-call text-back for local businesses | $99–$299/mo + setup fee | $15k–$100k+ MRR |
| 23 | [CartBoost](apps/23-cartboost) | Shopify app | One-click post-purchase upsells, flat-priced (no revenue share) | $29–$79/mo | $8k–$60k MRR |
| 24 | [TradeLog](apps/24-tradelog) | Web SaaS | Auto-importing trading journal with leak detection for retail traders | $19–$49/mo | $10k–$60k MRR |
| 25 | [ResumeRocket](apps/25-resumerocket) | Web app | AI resume/cover-letter studio that tailors to each job posting + ATS X-ray | $9.95/wk pass, $19.95/mo | $10k–$80k MRR |
| 26 | [RoomGenius](apps/26-roomgenius) | Web app | AI interior design: restyle your room photo, then shop the look | Credit packs + $29/mo pro staging + affiliate | $8k–$60k/mo |
| 27 | [StepDocs](apps/27-stepdocs) | Chrome extension + SaaS | Record a workflow once → polished step-by-step SOP guide (Scribe alternative) | $12–$25/seat/mo | $8k–$50k MRR |
| 28 | [ClientDock](apps/28-clientdock) | Web SaaS | White-label client portals for agencies (status, files, approvals, invoices) | $29–$149/mo flat | $10k–$60k MRR |
| 29 | [MailProbe](apps/29-mailprobe) | API product | Email verification API with honest confidence scoring | Usage-based ~$0.006/check + plans | $5k–$50k MRR |
| 30 | [CloudSpend](apps/30-cloudspend) | B2B SaaS | Cloud cost monitoring for startups: anomaly alerts + deploy correlation | $49–$199/mo flat | $10k–$70k MRR |
| 31 | [QuoteFox](apps/31-quotefox) | B2B SaaS | AI quote builder for trades: walk the job, send the bid from the driveway | $49–$199/mo | $15k–$100k MRR |
| 32 | [PermitPath](apps/32-permitpath) | B2B SaaS | Permit intelligence for contractors: requirements, tracking, expiry alerts | $99–$249/mo | $10k–$80k MRR |
| 33 | [CrewClock](apps/33-crewclock) | B2B SaaS | GPS-verified crew time tracking + live job costing, bilingual EN/ES | $8/user, $49 floor | $10k–$80k MRR |
| 34 | [MenuLift](apps/34-menulift) | B2B SaaS | QR menus, one-tap 86ing, menu-engineering analytics for restaurants | $29–$79/mo/location | $8k–$50k MRR |
| 35 | [LedgerLens](apps/35-ledgerlens) | B2B SaaS | Receipt inbox → AI-categorized monthly close package for solo operators | $19–$79/mo | $8k–$60k MRR |
| 36 | [BidBoard](apps/36-bidboard) | B2B SaaS | Subcontractor bid collection + leveling for small GCs | $149–$399/mo | $15k–$100k MRR |
| 37 | [SafetyDeck](apps/37-safetydeck) | B2B SaaS | OSHA toolbox talks, sign-offs, incident logs, cert expiry for field crews | $59–$149/mo | $10k–$70k MRR |
| 38 | [DuesDesk](apps/38-duesdesk) | B2B SaaS | Dues autopay, violations, and comms for small HOAs, clubs, leagues | $49–$199/mo | $8k–$60k MRR |
| 39 | [GreenTally](apps/39-greentally) | B2B SaaS | Utility bills + spend CSV → supplier-ready carbon reports for SMBs | $99–$299/mo | $10k–$80k MRR |
| 40 | [FormCoach](apps/40-formcoach) | Mobile app | On-device AI form check for squat/deadlift/bench with bar-path trace | Freemium $12.99/mo | $10k–$100k MRR |
| 41 | [StudyReel](apps/41-studyreel) | Mobile app | Lectures → grounded notes, spaced-repetition decks, cited practice exams | $9.99/mo, $49/yr student | $10k–$100k MRR |
| 42 | [SchemaSentry](apps/42-schemasentry) | Dev tool | API breaking-change watchdog: spec diffs in CI, contract tests, changelog | $49–$199/mo | $10k–$80k MRR |
| 43 | [PaidWell](apps/43-paidwell) | B2B SaaS | A/R autopilot for agencies: polite escalation, payment portal, forecast | $79–$249/mo | $10k–$80k MRR |
| 44 | [TenantFile](apps/44-tenantfile) | B2B SaaS | DIY-landlord toolkit: applications, screening, leases, rent ledger | $19–$59/mo | $10k–$80k MRR |
| 45 | [RosterRally](apps/45-rosterrally) | B2B SaaS | Youth sports club ops: registration, payments, schedules, parent comms | $1.50/reg or $49/mo | $8k–$60k MRR |
| 46 | [ClauseCompass](apps/46-clausecompass) | B2B SaaS | Contract risk flags + plain-English redlines for freelancers and SMBs | $29–$79/mo + per-doc | $8k–$60k MRR |
| 47 | [ShelfSense](apps/47-shelfsense) | Shopify app | Inventory forecasting: reorder points, PO drafts, dead-stock alerts | $59–$199/mo | $10k–$80k MRR |
| 48 | [FormForge](apps/48-formforge) | B2B SaaS | HIPAA-conscious intake forms + e-sign for therapists and small clinics | $49–$149/mo | $10k–$80k MRR |
| 49 | [GrantGrid](apps/49-grantgrid) | B2B SaaS | Grant discovery with fit scoring + application workspace for nonprofits | $59–$199/mo | $8k–$60k MRR |
| 50 | [WaiverWing](apps/50-waiverwing) | B2B SaaS | Digital waivers + kiosk check-in for gyms, tours, and rentals | $29–$99/mo | $8k–$50k MRR |
| 51 | [MenoCompass](apps/51-menocompass) | Mobile app | Local-first perimenopause companion: symptoms + HRT management + doctor-ready reports (top pick from [WOMENS_NICHES_RESEARCH.md](./WOMENS_NICHES_RESEARCH.md)) | $59.99/yr w/ trial + $9.99/mo | $20k–$150k MRR |
| 52 | [StimTrack](apps/52-stimtrack) | Mobile app | IVF + egg-freezing journey manager, loss-aware by design (research rank #2) | $9.99/mo or $79/yr | $10k–$80k MRR |
| 53 | [SplitKit](apps/53-splitkit) | Mobile app | Single-player divorce ops for women: discovery checklists, vault, court-ready record (research rank #3) | $14.99/mo or $99/yr | $10k–$80k MRR |
| 54 | [KinDesk](apps/54-kindesk) | Mobile app | Family-care command center for the sandwich-generation daughter: shared tasks, split expenses, vault, weekly digest (research rank #4) | $9.99/mo family or $79.99/yr | $8k–$60k MRR |

## Why these 50

Key findings from the research that drove selection and ranking:

- **Utilities and productivity apps have the highest per-user value** — utility-app trial users show ~$68.90 LTV over 12 months, and weekly-plan-plus-trial is the highest-LTV paywall configuration (→ SubSage, Streakly, ShotStash).
- **Health & fitness is the only category where annual plans dominate** (~60%), giving up-front cash flow (→ DriftOff).
- **B2B micro-SaaS tied to customer revenue** (payment recovery, monitoring, backups) has 70–90% margins and near-zero churn because it pays for itself (→ Dunly, PulseWatch, VaultBack).
- **AI-powered content and workflow tools** have proven willingness to pay at $19–$99/mo (→ ClipForge, Briefcast, InboxPilot, RankRadar, AnswerDesk).
- **Vertical tools beat horizontal ones** — niche CRMs and freelancer tools outperform generic competitors because they encode domain workflows (→ LensCRM, PaperTrail).
- **Developer tools have the clearest distribution** (GitHub Marketplace, dev communities) and devs pay for anything that saves an hour (→ MergeMate, ParseFlow, VaultBack, PulseWatch).
- **One-time-purchase AI photo tools** monetize virality better than subscriptions (→ LumaShot).
- **Content/SEO websites** (directories) are the lowest-build-effort recurring income of the set (→ NicheHub).
- **Education/language learning is a top-grossing subscription category**, and AI finally delivers its missing feature — speaking practice (→ LingoLoop).
- **Local businesses pay B2B prices for anything that saves a lost job** — a missed call costs more than a year of software (→ CallCatch).
- **Marketplace/app-store distribution channels** (Shopify App Store, Chrome Web Store) put buyers with wallets open in front of the product (→ CartBoost, StepDocs, InboxPilot).
- **Passionate-hobbyist niches with money on the line** (retail traders) sustain some of the highest ARPUs in consumer SaaS (→ TradeLog).
- **Evergreen consumer urgency** (job seeking, home decorating) delivers endless new demand at high volume, monetized fast via passes and credit packs (→ ResumeRocket, RoomGenius).
- **Infrastructure APIs and cost tools** churn near zero once embedded — swap-cost revenue (→ MailProbe, CloudSpend, ParseFlow).

## What's inside every app folder

```
apps/NN-name/
├── README.md          # Product spec: problem, market, monetization, MVP, GTM, risks
├── ARCHITECTURE.md    # Stack, system design, data model, third-party services, cost structure
├── DESIGN.md          # Studio design spec: brand identity, art direction, motion system,
│                      #   3D/animation signature moment, key screens, reduced-motion plan
├── ROADMAP.md         # Phased build plan: MVP → v1 → growth
├── .gitignore
├── .env.example       # Every secret/config the app will need
├── package.json       # (or requirements.txt / src-tauri config, per platform)
├── tsconfig.json      # Plus the build config its stack needs (next.config.ts, postcss…)
└── src/               # Full folder structure with stub files — headers + TODOs, no implementation
    └── app/
        ├── layout.tsx    # Root layout: metadata, viewport theme colour, font loading
        └── globals.css   # The app's own palette and type roles, from its DESIGN.md
```

The build config, root layout and `globals.css` are real and working — they are
what makes each scaffold compile from day one. Everything else under `src/` is
still a stub: headers and TODO lists, no business logic.

All 30 design specs share one motion-and-craft constitution — easing tokens, 3D
budgets, performance and reduced-motion rules — defined in
[DESIGN_LANGUAGE.md](./DESIGN_LANGUAGE.md).

## Sources

- [RevenueCat — State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps/)
- [Adapty — State of In-App Subscriptions 2026](https://adapty.io/state-of-in-app-subscriptions/)
- [Adapty — What Apps Make the Most Money](https://adapty.io/blog/what-apps-make-the-most-money/)
- [Business of Apps — Top Grossing Apps](https://www.businessofapps.com/data/top-grossing-apps/)
- [Dodo Payments — 30 Profitable Micro SaaS Ideas for 2026](https://dodopayments.com/blogs/micro-saas-ideas-2026)
- [BigIdeasDB — Simple SaaS Ideas for Solo Developers 2026](https://bigideasdb.com/simple-saas-ideas-for-solo-developers-2026)
- [Elementor — 20 Profitable SaaS & Micro-SaaS Ideas](https://elementor.com/blog/profitable-saas-micro-saas-ideas/)
- [ChromeGoldmine — Profitable Chrome Extension Niches](https://chromegoldmine.com/blog/profitable-chrome-extension-niches/)
- [MobileAction — What Apps Make the Most Money in 2026](https://www.mobileaction.co/blog/what-apps-make-the-most-money/)
