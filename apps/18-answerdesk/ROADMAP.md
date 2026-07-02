# AnswerDesk Roadmap

## Phase 0 — Setup (week 0)
- Next.js + Postgres (pgvector) + Redis + crawler worker run locally
- Chat widget bundle builds and mounts on a test page

**Done when:** a hardcoded bot answers from 5 manually indexed pages with citations.

## Phase 1 — MVP (weeks 1–5)
- Site crawler (sitemap-first, 500-page cap) → chunking → embeddings pipeline
- RAG answer flow with inline citations + confidence gate ("I'm not sure — want to email support?")
- Embeddable widget: launcher, streaming answers, handoff-to-email form
- Bot setup wizard: enter URL → crawl → test chat in dashboard
- Stripe plans + message metering

**Done when:** onboarding a fresh docs site to a working embedded bot takes <10 minutes, and the bot declines instead of hallucinating on out-of-scope questions in the eval set.

## Phase 2 — Launch (weeks 6–9)
- Deflection analytics dashboard + weekly content-gap report email (the differentiator)
- Slack handoff; file uploads (PDF/markdown) as sources; incremental re-crawl
- "Try it on your site" instant demo on the landing page (crawls 10 pages live)
- Launch: Show HN, Product Hunt, comparison pages vs Chatbase/SiteGPT/Fin

**Done when:** 15 paying bots live; measured deflection ≥40% on pilot customers; demo→signup ≥10%.

## Phase 3 — Growth (months 3–6)
- API + webhooks (create bots programmatically — agencies)
- Multilingual answers; per-page answer quality scoring feeding re-crawl priority
- Human-agent inbox (lightweight) so handoffs can stay in-product
- Annual plans + agency tier

**Done when:** $10k MRR; net revenue retention >100%; unanswered-question rate trending down for ≥70% of active bots.
