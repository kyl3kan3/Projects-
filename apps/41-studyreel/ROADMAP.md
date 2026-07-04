# StudyReel Roadmap

## Phase 0 — Setup (Week 0, ~4-5 days)

Repo, infra, and the grounding benchmark so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Expo + TypeScript repo with expo-router; `web/` Next.js companion scaffolded; CI runs lint + typecheck + jest on every push
- [ ] Fastify API boots (`npm run server`) with zod-validated route schema; deploys to Railway/Fly
- [ ] Neon Postgres + pgvector provisioned; Drizzle migrations working; **the grounding DB constraint (non-empty `citation_chunk_ids`) in the first migration**
- [ ] Upstash Redis + BullMQ round-trip proven; WebSocket progress channel working end to end
- [ ] R2 bucket + presigned upload/download proven from both app and web
- [ ] Deepgram and Anthropic keys wired; one real lecture (audio + slides) transcribed, parsed, and chunked in a script
- [ ] RevenueCat project: `premium` entitlement; monthly, annual, and .edu-targeted Student Annual products in sandbox
- [ ] Grounding benchmark assembled: 3 real courses' material + 150 expert-checked Q/A pairs (the accuracy yardstick exists before generation does)
- [ ] `.env.example` complete; Sentry + PostHog wired

## Phase 1 — MVP (Weeks 1-10)

Goal: a student ingests a real course, approves a cited deck, holds a daily review habit, and takes a cited practice exam.

- **Weeks 1-2: Ingestion spine.** Uploads (app + web), source lifecycle, transcription + PDF/slides parsing jobs, progress streaming, failure UX.
- **Week 3: Alignment + chunking.** Transcript-slide alignment, anchor-bearing chunks, embeddings, course outline with coverage grades.
- **Weeks 4-5: Grounded generation.** Notes per topic; proposed cards with retrieval-locked generation + the verification pass (entailment check, discard on failure); the approval queue.
- **Week 6: Review loop.** FSRS scheduling on device, offline queue, swipe + button grading, honest streak, review-event sync with deterministic recompute.
- **Week 7: The citation experience.** The flip-to-source signature (transcript scrub + PDF highlight), citation caching for offline, per-item report flow.
- **Weeks 8-9: Practice exams.** Config -> coverage-checked item generation (thin topics excluded visibly), timed runs, cited answer key, self-grade rubrics, readiness view.
- **Week 10: Monetization + hardening.** RevenueCat paywall at the three gates; .edu verification; server-side entitlement checks on ingest endpoints; cost dashboard per ingest; load test a 40-hour-audio course.

**Acceptance criteria:**

- [ ] End-to-end: a real course (10+ lectures, slides, one PDF) ingests to an approved deck in under 30 minutes of processing, unassisted
- [ ] **Grounding benchmark: ≥98% of generated cards/exam answers entailed by their cited passage (expert-judged); the remainder are discard-path failures, never shipped items; zero items exist without citations (DB-enforced)**
- [ ] Citation flip resolves in <1s to the exact transcript span (audio scrubbed ±5s accurate) or highlighted PDF region
- [ ] Coverage map honestly flags thin topics; exam generation refuses to fabricate items for them (fixture-proven)
- [ ] Daily review works fully offline; two devices reviewing offline reconcile to identical FSRS state after sync (property test)
- [ ] Free-tier caps enforced server-side (ingests) and in UX (deck cap); the daily review loop is never paywalled
- [ ] Sandbox purchase/restore on mobile; web access gated by server-verified entitlement; .edu flow issues the Student Annual offering
- [ ] Ingest unit cost measured per lecture and per course, visible in an internal dashboard, and under $2.00/course median
- [ ] 15 beta students across ≥5 real courses; week-4 review retention ≥40%; ≥3 reported items triaged same-day

## Phase 2 — Launch (Weeks 11-16)

Goal: App Store + web launch timed to a term start, first 1,000 paying users, the citation demo everywhere.

- Launch timed 4-6 weeks before the September (or January) term; ASO on "study from lectures," "flashcards from PDF," "NCLEX flashcards"
- Landing page per MARKETING_PLAYBOOK.md — device: the flip to the professor's own slide ("it cited lecture 7, 34:12")
- Creator seeding: 25 studytok/medtok/nursing creators with free premium; the 20-second citation-tap demo as the content unit
- The wedge content piece: "we checked AI study tools' flashcards against the actual lecture" with receipts
- Deck citation-preview sharing (read-only fronts + sources; claiming requires the app) — the course-mate referral loop
- Onboarding: bundled sample course so the first flip happens before any upload
- Android build ships (Expo makes this cheap; the category is not iOS-only)

**Acceptance criteria:**

- [ ] Live on iOS + Android + web; crash-free sessions ≥99.5%
- [ ] 1,000 paying users; trial-to-paid ≥35%; Student Annual ≥40% of new paid
- [ ] Top-10 App Store ranking for at least one core keyword family
- [ ] ≥200 shared citation previews/week; ≥8% of recipients install (measured)
- [ ] ≥5 creator videos live; blended CPI from creator content <$1.50
- [ ] Grounding report rate <0.5% of served items, with same-day triage median
- [ ] Support load <10 tickets/week per 1,000 users; ingestion-failure runbook exists

## Phase 3 — Growth (Months 5-12)

Goal: $25k+ MRR, the professional-exam segment, and the retention machine.

- Professional-exam packs: exam-format templates (NCLEX-style item shapes, CPA sims), exam-date study plans, readiness pacing
- Live-lecture capture with same-day notes (record in class, cited deck by dinner)
- Collaborative course spaces: private, course-mate-only sharing of *approved* decks over user-owned material (copyright-reviewed design)
- Image-occlusion cards for diagram-heavy courses (anatomy, chemistry)
- Win-back + seasonal lifecycle: term-start reactivation, summer MCAT/LSAT cycles, exam-date countdown campaigns
- Transcription cost program: batch/off-peak processing, model tiering by audio quality — published unit-cost target
- Prep-publisher conversations (UWorld/Kaplan-adjacent): partnership or acquisition interest follows the segment's traction

**Acceptance criteria:**

- [ ] $25k MRR; blended monthly logo churn <8% with annual mix ≥50% (seasonality-honest targets)
- [ ] Professional-exam candidates ≥25% of revenue; ≥100 verified "passed my exam" outcomes collected with consent
- [ ] Month-4 review retention ≥30% among students whose course ended (the habit outlives the course for a meaningful slice)
- [ ] Live-capture used for ≥20% of new lectures among premium students
- [ ] Ingest gross margin ≥70% at steady state (cost program delivered, numbers published internally)
- [ ] Grounding benchmark re-run quarterly with results published in the changelog — including regressions, honestly
- [ ] Zero copyright takedowns escalating beyond standard DMCA handling
