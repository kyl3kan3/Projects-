# ClipForge — Roadmap

## Phase 0 — Setup (Week 0)

Foundation so week 1 starts on product, not plumbing.

- [ ] Repo, CI (lint + typecheck + test on PR), preview deploys
- [ ] Next.js 15 + Tailwind + Drizzle scaffold running locally against Dockerized Postgres + Redis
- [ ] Neon (Postgres), Upstash (Redis), R2 bucket, Stripe test mode, Resend domain verified
- [ ] Auth (email magic link + Google OAuth) and workspace creation
- [ ] Worker process boots, connects to BullMQ, runs a no-op job end to end

**Acceptance criteria:** a fresh clone reaches a logged-in dashboard with `npm install && npm run dev`; a test job enqueued from the web app is executed by the worker and its status is visible in the DB.

## Phase 1 — MVP (Weeks 1–8)

### Weeks 1–2: Ingestion & transcription
- [ ] Presigned multipart upload (drag-drop, progress, resume)
- [ ] YouTube/RSS import job
- [ ] Whisper transcription stage with word timestamps; transcript viewer UI

### Weeks 3–4: The AI core
- [ ] Clip-selection prompt + structured output parsing → ranked candidates with exact bounds
- [ ] Text outputs: tweet thread, 2 LinkedIn variants, newsletter draft — all with transcript citations
- [ ] **Golden-set eval harness**: 15 reference episodes with human-picked clips; selection changes must not regress precision@5 (this is the product's quality gate, treat it like a test suite)

### Weeks 5–6: Rendering
- [ ] ffmpeg cut + 9:16/1:1 crop + ASS caption burn-in, 3 caption style presets
- [ ] Transcript-based clip editor (adjust bounds, re-render single clip)
- [ ] Render caching by content hash; failure recovery + retries

### Weeks 7–8: Billing & polish
- [ ] Stripe: 3 tiers, trial (2 uploads, watermarked), quota enforcement, $3 overage, customer portal
- [ ] Processing-status dashboard + Resend completion emails
- [ ] Onboarding: first-upload guided flow; sample project pre-loaded

**Acceptance criteria (MVP done):**
- A 90-minute podcast goes from upload to a ready content kit (≥5 clips + thread + 2 LinkedIn posts + newsletter) in under 20 minutes with zero operator intervention
- Golden-set eval: ≥3 of top-5 selected clips match human picks on average
- Full billing lifecycle works in Stripe test mode: trial → subscribe → hit quota → overage → cancel
- Pipeline failure at any stage leaves the project in a retriable state with a user-visible error, never a stuck spinner
- 10 external beta users have each processed ≥2 real episodes

## Phase 2 — Launch (Weeks 9–12)

- [ ] Marketing site with real output examples (before/after per format)
- [ ] Free tools live: podcast quote-card generator + YouTube chapter generator (lead magnets, each with its own PH launch)
- [ ] Product Hunt launch + Show HN; r/podcasting and Indie Hackers posts
- [ ] Comparison SEO pages shipped: Opus Clip alternative, Castmagic vs, Repurpose.io vs
- [ ] Affiliate program (30% first-year) live with 3 podcast-educator partners signed
- [ ] Analytics (PostHog): activation funnel (signup → first upload → first export) instrumented
- [ ] Support: docs site + Intercom-alternative (Plain/Crisp) wired

**Acceptance criteria:** 100 signups in launch month; ≥30% of signups complete first upload; ≥8% trial→paid; first 20 paying customers; churn + activation dashboards reviewed weekly.

## Phase 3 — Growth (Months 4–9)

- [ ] Brand presets + custom caption styles (Pro upsell) — if not landed in Phase 1
- [ ] Team workspaces: seats, roles, approval workflow (unlocks the B2B segment)
- [ ] Direct publishing/scheduling (YouTube Shorts, LinkedIn; X if API economics allow)
- [ ] Active-speaker detection for smarter vertical crops
- [ ] Self-hosted whisper.cpp on workers (COGS −80% on transcription)
- [ ] API + Zapier for Team tier; podcast-host integration listings (Transistor, Buzzsprout)
- [ ] Annual plans + win-back email flows; pricing experiment on Starter upload count

**Acceptance criteria:** $10k MRR; Team tier ≥25% of revenue; monthly logo churn ≤7% blended; COGS ≤25% of revenue; ≥2 podcast-host directories listing ClipForge; eval suite runs in CI on every prompt/model change.
