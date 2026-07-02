# NicheHub Roadmap

## Phase 0 — Setup (week 0)
- Astro engine skeleton builds with a sample config + 50-listing seed dataset

**Done when:** `npm run build` emits listing/category pages with valid JSON-LD (validated by Google's Rich Results test).

## Phase 1 — Engine MVP (weeks 1–4)
- `directory.config.ts` contract finalized; ingestion scripts (validate/dedupe/enrich)
- Page generators: listings, categories, category×location, best-for, A-vs-B comparisons, alternatives
- Thin-content guard + sitemap/canonical/OG plumbing; Pagefind search + facet filters
- Submission form + moderation queue

**Done when:** directory #1 (chosen by keyword research) deploys with 200+ enriched listings and passes CWV + rich-results checks on every page type.

## Phase 2 — Monetize directory #1 (weeks 5–10)
- Claim-listing flow + Stripe sponsored tiers + automated placement on rebuild
- Affiliate click tracker + per-niche URL templates
- "You're listed" outreach sequence; data-piece for backlinks
- Email capture (newsletter/alerts) on all page types

**Done when:** first sponsored listing sold; 10 referring domains earned; impressions trending up in Search Console for 4 consecutive weeks.

## Phase 3 — Portfolio (months 3–12)
- Launch directories #2–#5 from the same engine (new config + dataset each)
- Re-verification jobs + "last verified" stamps; dead-listing pruning
- Display ads once any directory passes ~50k sessions/mo
- Optional pivot-up: multi-tenant SaaS version ("launch your own directory") only if inbound demand appears

**Done when:** portfolio revenue ≥$2k/mo with ≥2 directories contributing; engine launch time for a new niche ≤1 week.
