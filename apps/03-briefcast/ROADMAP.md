# Briefcast -- Roadmap

Solo/duo-founder pace assumed. Phase 1 is ~8 weeks of build; CRM sync lands at the tail of Phase 1 and gates Phase 2 launch (it is the differentiator -- launching without it means launching a commodity).

## Phase 0 -- Setup (Week 0)

Scope: repo, infra, accounts, walking skeleton.

- [ ] Next.js 15 + TypeScript + Tailwind app scaffolded; deploys to Vercel on push
- [ ] Neon Postgres provisioned; Drizzle schema + first migration applied; `db:generate`/`db:migrate` scripts work
- [ ] Upstash Redis provisioned; BullMQ worker process runs locally and on Railway/Fly with a no-op job round-tripping
- [ ] Auth.js sign-in with Google works end to end (org auto-created on first sign-in)
- [ ] Vendor accounts created and keys in env: Recall.ai, Deepgram, Anthropic, Stripe (test mode), Slack app (dev), HubSpot developer app, Resend
- [ ] `.env.example` complete; local `docker compose` or equivalent dev story documented in repo
- [ ] Error tracking (Sentry or similar) wired in app + worker

## Phase 1 -- MVP (Weeks 1-8)

### Weeks 1-2: Calendar + bot join

- [ ] Google Calendar OAuth + sync: upcoming events with Zoom/Meet/Teams links appear as `meetings` within 5 min of creation/change
- [ ] Per-user join rules (all / external-only / opt-in) respected; per-meeting toggle in UI
- [ ] Recall.ai bot scheduled and joins a real Zoom, Meet, and Teams call; bot name announces recording
- [ ] Recall webhooks verified (signature), bot status visible live in UI; failure states (not admitted, meeting canceled) handled and surfaced
- [ ] Microsoft calendar deferred if slipping -- acceptable to cut from MVP

### Weeks 3-4: Transcription + extraction

- [ ] Recording fetched and transcribed via Deepgram with diarization; segments stored; 1-hr call processes in < 10 min end to end
- [ ] Speaker labels mapped to attendees when confidently matchable
- [ ] Claude extraction returns schema-valid JSON (Zod-validated) for: overview, decisions, action items (owner/due), risks, next steps; invalid output auto-repaired or retried, never stored raw
- [ ] Manual QA on 20 real recorded meetings: >= 90% of action items judged correct-and-useful by a human; hallucinated commitments treated as P0 bugs
- [ ] Meeting detail page: summary, action items, searchable transcript with timestamps

### Weeks 5-6: Slack + billing + team model

- [ ] Slack app install (org-level OAuth); post-meeting DM to organizer with summary + action items within 15 min of call end
- [ ] Optional channel delivery per team; message formatting reviewed on desktop + mobile Slack
- [ ] Org invites, roles (admin/member); org settings page (consent mode, join rules defaults)
- [ ] Stripe: 14-day trial, Checkout, per-seat quantity synced on invite/remove, webhooks update entitlements; past-due locks bot scheduling, not data access
- [ ] Recording-hour metering per plan with 80% warning email

### Weeks 7-8: HubSpot write-back (the wedge)

- [ ] HubSpot OAuth connect; pipelines/properties pulled; default field mappings editable
- [ ] Meetings auto-matched to contacts/deals via attendee emails; ambiguous matches prompt user; manual link/unlink in UI
- [ ] Meeting logged to HubSpot as engagement with summary; action items as HubSpot tasks
- [ ] Field-level proposals (next step, stage, close date) shown with evidence; review-mode approve/dismiss in UI; every write recorded in `crm_sync_logs` with old/new values
- [ ] Idempotency verified: reprocessing a meeting never duplicates engagements/tasks
- [ ] Per-deal timeline page: all linked meetings + extracted signals in order

**Phase 1 exit criteria:** 5 design-partner teams (free) using it weekly on real calls; a full meeting -> HubSpot cycle demonstrated with zero manual steps; hallucination/incorrect-field-write rate measured and < 2% of proposals.

## Phase 2 -- Launch (Weeks 9-14)

- [ ] Marketing site: positioning ("meetings that update your CRM"), pricing page, demo video, consent/security page
- [ ] Self-serve onboarding: sign up -> calendar connect -> first meeting summarized without human help; activation funnel instrumented (target: >= 40% of signups get a first summary within 7 days)
- [ ] HubSpot App Marketplace listing submitted and certified (their review checklist drives some hardening: scopes, uninstall handling, rate limits)
- [ ] Slack App Directory listing submitted
- [ ] Billing hardened: dunning, cancellation flow, plan up/downgrade, annual pricing
- [ ] Consent + privacy baseline shipped: bot announcement, pre-meeting notice email option, org retention setting, delete-meeting and delete-account flows, DPA + privacy policy reviewed
- [ ] Ops: uptime monitoring, on-call alerting for pipeline failures, status page; pipeline success rate >= 99% over trailing 2 weeks
- [ ] Launch: Product Hunt + LinkedIn + RevGenius/Sales Hacker posts; 3 case-study writeups from design partners
- [ ] Exit criteria: 25 paying teams OR $2.5k MRR; churn-reason interviews for every cancellation

## Phase 3 -- Growth (Months 4-9)

- [ ] Pipedrive integration + Pipedrive Marketplace listing (same adapter interface; target 4 weeks)
- [ ] Salesforce integration (expect this to be 2-3x the HubSpot effort; gate on demand from >= 10 prospects)
- [ ] Microsoft calendar + Teams-first orgs supported end to end
- [ ] Business tier ships: custom extraction playbooks, manager weekly digest, team analytics, SSO/SAML, audit log
- [ ] Auto-apply mode for high-confidence CRM updates with per-field confidence thresholds and undo
- [ ] Agency partner program live: 5+ HubSpot/Pipedrive solution partners reselling, rev-share dashboard
- [ ] Content engine running: 2 posts/week (founder LinkedIn) + 2 SEO/community pieces/month; track signups by channel
- [ ] Cost work: Recall volume pricing renegotiated at ~10k hrs/mo; hours-per-seat cohort dashboard; gross margin >= 65%
- [ ] Exit criteria: $15-25k MRR, >= 60% of revenue on Pro/Business, logo churn < 3%/mo, marketplace listings each driving >= 20 signups/mo
