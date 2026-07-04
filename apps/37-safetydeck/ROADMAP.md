# SafetyDeck Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Cloudflare R2 bucket created; signed PUT/GET round-trip proven (signature PNG + photo upload)
- [ ] Serwist service worker registered; a talk page precaches and renders airplane-mode
- [ ] Twilio account + number acquired; 10DLC registration *started* (it takes weeks -- begin now); Resend domain verified (SPF/DKIM)
- [ ] Vercel Cron against a stub job route with double-fire idempotency proven
- [ ] Stripe test mode; three products/prices created; webhook receiving test events via Stripe CLI
- [ ] Signed crew-token scheme (jose) proven: mint, verify, expire
- [ ] 29 CFR 1904 recordability decision tree drafted as versioned data (reviewed against the rule text; safety-consultant review scheduled)
- [ ] `.env.example` complete; secrets in Vercel envs, never in repo; Sentry wired in

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design-partner contractor runs real Monday talks with real signatures for a month, logs a test incident through to a correct 300A, and exports the binder.

- **Weeks 1-2: Roster + talks.** Auth (Auth.js) + company/crew/employee model (no worker logins); talk library seeded with 52 talks (hazard-tagged, 5-minute reads); talk scheduling + rotation; the Monday SMS/email fan-out cron.
- **Weeks 3-4: The crew flow.** Signed-link crew PWA: talk screen, roster, sequential signature capture, huddle photo, GPS/time stamps; IndexedDB outbox + `/api/sync` (idempotent, immutable-after-sync); offline banner states; the sign-off stamp per DESIGN.md.
- **Week 5: Attendance + reminders.** Dashboard attendance matrix; talk-missed detection and the reminder ladder (email/SMS, idempotent via reminders table); attendance export.
- **Week 6: Incidents + forms.** One-question-per-screen intake; recordability engine (versioned logic, cited rule text, conservative outs); Form 300 rows with privacy-case handling; Form 301 detail; 300A generation with company denominators; severe-incident 8/24-hour duty screen.
- **Week 7: Certs + binder.** Cert entry (camera-first), expiry derivation, 60/30/7/overdue ladder; the inspection binder export (attendance + 300 log + 300A + cert matrix + incident list, dated PDF bundle, audit-logged).
- **Week 8: Billing + hardening.** Stripe Billing (three tiers, headcount limits); crew-token abuse limits; sync conflict tests (two devices, same instance); load test a 25-person sign-off; empty/error states; DRY_RUN safety.

**Acceptance criteria:**

- [ ] A new company can add a crew, schedule a talk, and collect a real signature on a phone within 15 minutes of signup, unassisted
- [ ] An 8-person crew completes talk + sign-off in under 5 minutes on one phone (timed with a design partner -- the north-star flow)
- [ ] Full sign-off works in airplane mode and syncs correctly on reconnect; device vs server timestamps are both preserved and displayed honestly
- [ ] Sign-offs are immutable post-sync: the API rejects mutation attempts (test proves it); corrections append
- [ ] Two-device conflict (same instance, overlapping rosters) resolves without losing either device's signatures
- [ ] The recordability engine classifies the 1904 test-case suite correctly (first-aid-only -> not recordable; restricted work -> recordable; privacy cases masked on the 300), verified against the rule text by an external safety reviewer
- [ ] A test year generates a 300 log and 300A whose totals a safety consultant signs off as correct and posting-ready
- [ ] Hospitalization intake surfaces the 24-hour duty with correct contact info; nothing is auto-filed
- [ ] Cert ladder fires exactly once per rung (double-fire cron test); expired certs show red on the matrix same-day
- [ ] Binder export contains every seeded artifact for the range, renders under 30s, and is audit-logged
- [ ] Stripe checkout/upgrade/cancel work; headcount over-limit blocks with an upgrade prompt, never silent
- [ ] 3-5 design partners run 4+ consecutive weekly talks with real crews and zero lost sign-offs

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 30 paying companies, the insurance/GC channels seeded.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: the $16k citation because sign-in sheets lived in a truck) with the binder-export demo
- Free printable toolbox-talk pack + "OSHA 300A deadline" content (lead magnets); SEO on talk/300A/cert keywords
- Spanish-language talk library + crew flow (Company tier fast-follow -- field reality demands it early)
- Broker/insurance referral kit ("give this to your insured"); GC-prequal share page ("our safety program")
- Comparison pages: vs SafetyCulture, vs paper, vs SafetyMeetingApp
- Launch: trade association newsletters, r/Construction, contractor Facebook groups with the 5-minute sign-off video

**Acceptance criteria:**

- [ ] Self-serve funnel proven: at least 15 companies signed up and completed a real crew sign-off with zero human help
- [ ] 30 paying companies; weekly-active-crew rate >= 70% (crews completing their talk each week -- the retention metric)
- [ ] Spanish crew flow shipped and used by >= 5 companies
- [ ] At least 5 customers attributable to insurance/broker or GC-prequal channels
- [ ] Talk-pack lead magnet converting visitors to email signups at >= 5%
- [ ] Support load sustainable: < 6 tickets/week per 30 customers; runbook for sync, SMS delivery, and 300A questions
- [ ] Zero incidents of lost or corrupted sign-off data (tracked explicitly; one is a launch-blocking postmortem)

## Phase 3 -- Growth (Months 4-12)

Goal: $25k+ MRR, February-season conversion machine, and the features that justify Fleet.

- JHA / pre-task plan capture (same signature flow, per-task)
- Equipment inspection checklists (harnesses, ladders, extinguishers) with the same expiry-ladder pattern
- ISNetworld/Avetta export packs (the prequal channel monetized)
- Near-miss/observation quick capture (photo + one line, feeds a trends view)
- Multi-entity + API export (Fleet tier); state-plan form variants where they differ from federal
- 300A electronic-submission (1904.41) helper for companies over the threshold
- February campaign automation: every January, "is your 300A ready?" to the entire lead base
- Annual form-logic compliance review (recurring operating task, versioned)

**Acceptance criteria:**

- [ ] $25k MRR; logo churn < 2%/month trailing 3 months (compliance stickiness proven)
- [ ] Weekly-active-crew rate >= 75% sustained; median sign-off time still < 5 minutes as features accrete (guard the core flow)
- [ ] February cohort: 300A-season campaign delivers >= 25% of Q1 new trials
- [ ] >= 15% of revenue on Fleet tier; >= 5 accounts using multi-entity
- [ ] ISN/Avetta export used by >= 20 companies (or a documented decision that the channel isn't worth deeper investment)
- [ ] Annual 1904 logic review completed and versioned before the new reporting year, with zero form-correctness incidents in the wild
- [ ] Organic search delivers >= 30% of new trials; insurance-channel partners >= 3 active with >= 2 referred customers each
