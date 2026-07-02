# LaunchList Roadmap

## Phase 0 — Setup (week 0)
- Next.js + Postgres + Redis running; a hardcoded hosted page renders at a slug

**Done when:** a signup lands in the DB from the hosted page.

## Phase 1 — MVP (weeks 1–4)
- Page builder (3 templates, theme controls, OG-image generation)
- Signup flow with double-opt-in; referral codes, position logic, skip-the-line boosts
- Milestone rewards + grant notifications
- Dashboard: signups, sources, referral leaderboard
- Free tier + Growth plan (Stripe); LaunchList badge on free pages
- Disposable-email blocking + basic fraud heuristics

**Done when:** a real pre-launch list runs end-to-end and a referred signup correctly jumps the queue.

## Phase 2 — Launch (weeks 5–8)
- Embed widget (<10KB); custom domains with DKIM/SPF wizard
- Email blasts with segments + unsubscribe handling
- CSV export + webhooks; A/B page tests (Pro)
- Launch on Product Hunt; template gallery pages for SEO

**Done when:** 500 lists created; free→paid ≥4%; badge clickthrough measurably driving signups.

## Phase 3 — Growth (months 3–6)
- Zapier app; API keys (Pro)
- Post-launch mode: convert list to updates/changelog audience (churn counter)
- Multi-list workspaces + annual pricing
- Referral-curve analytics benchmarks ("your K-factor vs. similar launches")

**Done when:** $3k MRR; ≥25% of new lists come from badge/viral loop; logo churn contextualized by launch-completion (post-launch mode adopted by ≥20% of launched lists).
