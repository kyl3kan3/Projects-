# MailProbe Roadmap

## Phase 0 — Setup (week 0)
- FastAPI + Postgres + Redis via docker-compose; API-key auth working
- Disposable/role/free-provider datasets loading in-memory

**Done when:** an authenticated /v1/verify returns syntax+DNS-layer verdicts.

## Phase 1 — MVP without probes (weeks 1–4)
- Full non-SMTP pipeline: syntax, typo suggestions, MX, disposable/role lists, known-provider strategies, honest confidence scoring
- Result cache with TTL classes; usage metering + Stripe (free tier, PAYG)
- Docs + one-line quickstart; Node/Python SDK stubs; bulk CSV jobs + webhooks

**Done when:** public beta verifies real signup traffic for 3 pilot apps; p95 latency <400ms; billing reconciles to the verification.

## Phase 2 — Probe fleet + launch (weeks 5–10)
- SMTP probe fleet: 2–3 warmed IP pools, per-provider throttles, deadline-degradation to "unknown"
- Catch-all detection with explicit labeling; accuracy benchmark suite published
- Realtime signup widget; abuse-detection v1 (anomalies, vetting)
- Launch: Show HN + engineering-blog post, alternative pages, RapidAPI/Zapier listings

**Done when:** accuracy on the public benchmark ≥ incumbents on probe-eligible domains; first $1k MRR; zero blacklistings of probe IPs.

## Phase 3 — Growth (months 3–9)
- Volume tiers + committed-use; GDPR DPA + EU processing option
- List-decay monitoring (re-verify schedules) as recurring revenue on bulk customers
- Framework integrations (Next.js/Django packages), open-source syntax layer
- SOC 2 prep when enterprise interest appears

**Done when:** $5k MRR; ≥60% of revenue from embedded realtime usage (the sticky kind); abuse rate <0.5% of accounts.
