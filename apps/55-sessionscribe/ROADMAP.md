# SessionScribe Roadmap

## Phase 0 — Setup (Week 0, ~4-5 days)

Repo, infra, and — above all — the BAA paper trail, so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] BAAs executed (or execution scheduled with signed intent) with Neon, Upstash, Cloudflare, Deepgram, Anthropic, and the hosting provider — **no real PHI flows before this list is done**; a written data-flow map names every system PHI touches
- [ ] Neon Postgres (Business plan) provisioned; Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis + BullMQ proven: enqueue from the app, process in a local `tsx` worker, retries and dead-letter verified; job payloads carry IDs only (reviewed as a rule, not a hope)
- [ ] R2 bucket with encryption; signed PUT/GET round-trip proven with an audio file; lifecycle purge tested
- [ ] Deepgram: one real audio file transcribed with diarization + word timestamps end to end
- [ ] Anthropic: one structured per-section draft generated from a transcript fixture, zod-validated, with span citations
- [ ] Stripe products/prices for the three tiers; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend domain verified; magic-link auth (Auth.js) working; a "draft ready" notification template reviewed to contain zero PHI
- [ ] `.env.example` complete; secrets in host envs, never in repo; Sentry wired with PII scrubbing on

## Phase 1 — MVP (Weeks 1-4)

Goal: a real clinician captures a real session, gets a faithful SOAP/DAP draft in ~2 minutes, reviews with source tracing, signs, and can export — with the audit log and retention purge running underneath.

- **Week 1 — Spine + capture.** Auth + practice/clinician setup (credentials, default format, signature block); PHI-minimal clients with consent state; session capture all three ways (in-browser recording, file upload, typed shorthand); signed PUTs to R2; `purge_at` stamped on every artifact; design tokens + global CSS from DESIGN.md before any screen.
- **Week 2 — The pipeline.** `transcribe-session` and `draft-note` workers end to end; SOAP + DAP built-in templates; per-section drafting with mandatory span citations; failure states that explain themselves; Today view with live pipeline status; usage counters.
- **Week 3 — The review room + sign & lock.** Two-surface review (note/transcript) with span tracing both directions; inline editing with versioned autosave; per-section regeneration; the sign gate (hash + transaction + immutability); amendments as new signed versions; the sign & lock animation per DESIGN.md; audit events on every view/edit/sign/export.
- **Week 4 — Trust + money + hardening.** Retention purge job with audited deletions; Trust screen (BAA state, retention control, readable audit log); signed-note PDF export (single + date range); Stripe Billing (trial, three tiers, meter on Solo); empty/loading/error states; `prefers-reduced-motion` pass; per-note COGS telemetry.

**Acceptance criteria:**

- [ ] A clinician can capture a 50-minute session (audio or shorthand) and have a reviewable draft in under 3 minutes for audio, under 30 seconds for shorthand (p50, measured)
- [ ] Every drafted sentence in an audio-sourced note traces to at least one transcript span; untraceable output is visibly flagged, never silently kept (test proves the flag)
- [ ] There is no code path that marks a note signed without a `signatures` row, and the API rejects edits to signed versions (both proven by tests)
- [ ] An amendment produces a new version with its own signature; the PDF renders the full chain
- [ ] Audio and transcripts purge on schedule; purge events appear in the audit log; the signed note survives untouched
- [ ] The audit log shows every access with actor, timestamp, and IP — verified against a scripted session of views/edits/exports
- [ ] A recording attempt against a client with no consent on file is blocked with the consent script offered; shorthand always works
- [ ] Note 41 on Solo prompts an upgrade without blocking review of existing drafts; checkout/upgrade/cancel flows work
- [ ] `npm install && npm run typecheck && npm run build` green; every screen matches DESIGN.md at 390px including empty/loading/error states
- [ ] 3-5 design-partner clinicians complete one full week of real notes each; zero PHI incidents (tracked explicitly; any occurrence is a stop-ship postmortem)

## Phase 2 — v1 Launch (Weeks 5-10)

Goal: public availability, first 150 paying clinicians, the review-and-sign story landing as the differentiator.

- Modality depth: EMDR and couples templates tuned with design-partner feedback (SUDs/targets tracking, dyad-pattern language); play-therapy and SFBT templates added
- Custom template editor (Caseload tier): section keys, labels, per-section drafting guidance
- Supervisor co-sign flow (Group tier) with the awaiting-cosign queue
- Marketing site per MARKETING_PLAYBOOK.md — enemy: pajama time; device: the 3:00 -> 3:07 between-sessions clock; CTA "Start free — 14 days" verbatim everywhere
- Trust page as a product surface: BAA list, retention defaults, audit-log screenshot, the "never auto-filed" architecture explained in plain language
- Comparison pages: vs Mentalyc, vs Upheal, vs SimplePractice's add-on, vs writing them yourself at 10pm
- Lead magnets: genuinely good SOAP/DAP guides and a consent-script pack; r/therapists and private-practice group launch with honest dogfood receipts

**Acceptance criteria:**

- [ ] 150 paying clinicians; trial -> paid >= 25% for trials that signed >= 3 notes
- [ ] Activation metric proven: median time from first capture to first signed note < 15 minutes
- [ ] >= 60% of active clinicians sign >= 20 notes/mo (the habit metric — this product only retains if it becomes the workflow)
- [ ] Per-note COGS p95 < $0.45 across the fleet; model routing live for shorthand
- [ ] Two comparison pages ranking on their target queries; >= 30% of signups name a competitor or "writing notes" as what they're replacing (asked at signup)
- [ ] Zero PHI incidents; third-party pen test completed with criticals closed

## Phase 3 — Growth (Months 4-12)

Goal: $40k+ MRR, group practices as the expansion motor, and the moat deepened at the review moment.

- Group tier expansion: practice-wide template standards, roster admin, org audit exports, supervisor dashboards
- Treatment-plan-aware drafting: goals/objectives context carried per client so drafts reference the plan (still never authoring the plan)
- Batch review flows for the end-of-day signer; keyboard-complete review room on desktop
- EHR-adjacent exports: formatted paste targets for SimplePractice/TherapyNotes fields; PDF layouts per common records-request formats
- Telehealth capture ergonomics (tab-audio capture guidance, consent overlays); languages beyond English as ASR quality allows
- Annual compliance review cadence (consent scripts, BAA renewals, retention defaults) as a recurring operating task

**Acceptance criteria:**

- [ ] $40k MRR; logo churn < 3%/month trailing 3 months
- [ ] >= 25% of new revenue from Group tier; >= 10 practices with 3+ seats
- [ ] Treatment-plan-aware drafting measurably reduces edit distance per note (tracked against the pre-launch baseline)
- [ ] Organic search + comparison pages deliver >= 40% of new trials
- [ ] Cost per note down >= 30% from launch via routing/volume pricing without a quality regression (edit-distance guardrail)
- [ ] Still zero PHI incidents — the streak is the brand
