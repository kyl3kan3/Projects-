# Profitable App Scaffolds

A curated portfolio of **20 buildable, high-profit-potential software products** — each researched, specified, and scaffolded so it can be lifted out of this repo and built as a standalone project.

> **Nothing here is built.** Every folder is a *launchpad*: a full product spec, market/profitability research, architecture, roadmap, and code scaffolding with stub files. Pick one, extract it, and start building.

## How to extract an app into its own repo

Every app folder under `apps/` is fully self-contained (own README, `.gitignore`, `.env.example`, config, and source tree). To spin one out:

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

## The Top 20, ranked

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

## Why these 20

Key findings from the research that drove selection and ranking:

- **Utilities and productivity apps have the highest per-user value** — utility-app trial users show ~$68.90 LTV over 12 months, and weekly-plan-plus-trial is the highest-LTV paywall configuration (→ SubSage, Streakly, ShotStash).
- **Health & fitness is the only category where annual plans dominate** (~60%), giving up-front cash flow (→ DriftOff).
- **B2B micro-SaaS tied to customer revenue** (payment recovery, monitoring, backups) has 70–90% margins and near-zero churn because it pays for itself (→ Dunly, PulseWatch, VaultBack).
- **AI-powered content and workflow tools** have proven willingness to pay at $19–$99/mo (→ ClipForge, Briefcast, InboxPilot, RankRadar, AnswerDesk).
- **Vertical tools beat horizontal ones** — niche CRMs and freelancer tools outperform generic competitors because they encode domain workflows (→ LensCRM, PaperTrail).
- **Developer tools have the clearest distribution** (GitHub Marketplace, dev communities) and devs pay for anything that saves an hour (→ MergeMate, ParseFlow, VaultBack, PulseWatch).
- **One-time-purchase AI photo tools** monetize virality better than subscriptions (→ LumaShot).
- **Content/SEO websites** (directories) are the lowest-build-effort recurring income of the set (→ NicheHub).

## What's inside every app folder

```
apps/NN-name/
├── README.md          # Product spec: problem, market, monetization, MVP, GTM, risks
├── ARCHITECTURE.md    # Stack, system design, data model, third-party services, cost structure
├── ROADMAP.md         # Phased build plan: MVP → v1 → growth
├── .gitignore
├── .env.example       # Every secret/config the app will need
├── package.json       # (or requirements.txt / src-tauri config, per platform)
└── src/               # Full folder structure with stub files — headers + TODOs, no implementation
```

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
