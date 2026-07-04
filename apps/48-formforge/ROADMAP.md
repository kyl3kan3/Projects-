# FormForge Roadmap

## Phase 0 -- Setup (Week 0, ~4-6 days)

Repo, infra, and the compliance paper trail so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned on a paid (BAA-eligible) plan; BAA executed; Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] AWS account + S3 bucket with SSE-KMS and least-privilege IAM; AWS BAA accepted
- [ ] Envelope-encryption spike proven: encrypt/decrypt a field with a per-practice wrapped DEK; keys never logged
- [ ] Upstash Redis provisioned; BullMQ hello-world round-trips app -> worker locally (payload = ids only)
- [ ] Worker boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Stripe account + test-mode products for the three plans
- [ ] Resend domain verified (SPF/DKIM); Twilio account + number; 10DLC registration *started* (takes weeks)
- [ ] Subprocessor BAA chain documented in a public page draft
- [ ] `.env.example` complete; secrets in envs, never in repo; Sentry wired with PII scrubbing on

## Phase 1 -- MVP (Weeks 1-9)

Goal: a design-partner practice sends a real intake packet, the patient signs on a phone, and the practice exports a PDF with the evidence summary.

- **Weeks 1-2: Data spine + crypto.** Practice/user/auth model (Auth.js, roles); field-level encryption helpers with decrypt-on-read audit hooks; append-only `audit_events` (no UPDATE/DELETE grants); form + immutable form-version model.
- **Weeks 3-4: Builder + templates.** Structured block types (demographics, insurance, history, consent, signature, upload, PHQ-9/GAD-7 screeners with scoring); block config sheets; publish flow with version stamps; behavioral-health template packet.
- **Weeks 5-6: Patient flow.** Tokenized `/intake/[token]` route; save-and-resume per section; mobile-first per DESIGN.md; screener scoring (client + server); e-signature capture with disclosure, hash, timestamp, IP -> `signature_records`; completion notifications.
- **Week 7: Reminders + status board.** Reminder ladder worker (quiet hours, opt-outs, stop-on-complete); intake status board with chips and overdue states; audit screen with filters.
- **Week 8: Exports.** PDF render (pdf-lib) with signature evidence summary; EHR-lite CSV with stable columns; both audit-logged and stored via signed URLs.
- **Week 9: Billing + BAA + hardening.** Stripe Checkout + webhooks + plan gating; self-serve BAA signing at signup; retention sweep job; security pass (session expiry, rate limits, token entropy review, dependency audit); empty/loading/error states.

**Acceptance criteria:**

- [ ] A new practice can sign up, sign the BAA, copy a template, and send an intake in under 15 minutes, unassisted
- [ ] PHI fields are ciphertext in the database (verified by direct SQL inspection) and unreadable without the practice DEK
- [ ] Every read path that decrypts PHI appends a `viewed` audit event — proven by a test that fails when a route skips the helper
- [ ] The audit table rejects UPDATE and DELETE at the database-permission level
- [ ] Patient flow works on a 390px phone over 3G throttling; save-and-resume survives a browser kill mid-packet
- [ ] Signing produces a `signature_records` row whose `document_hash` matches an independent hash of the rendered consent text + version (fixture test)
- [ ] Reminder ladder sends at +48h/+5d/+10d, respects quiet hours, and stops within 1 minute of completion (test clock)
- [ ] Reminder emails/SMS contain no PHI beyond patient first name + link (template audit test)
- [ ] Exported PDF includes every answer, the signature image, and the evidence summary; the export itself appears in the audit log
- [ ] Expired-retention intakes are hard-deleted (DB + S3) by the sweep and the deletion is audit-logged
- [ ] Stripe: all three plans purchasable in test mode; clinician-cap gating blocks new sends but never blocks reads/exports
- [ ] 3-5 design-partner practices live for 2+ weeks; >= 25 real packets completed; zero PHI-handling incidents

## Phase 2 -- Launch (Weeks 10-15)

Goal: public availability, first 25 paying practices, compliance story battle-tested.

- Third-party security review (penetration test + architecture review); publish the "how your data is protected" explainer
- Marketing site per MARKETING_PLAYBOOK.md + the HIPAA-risk checklist lead magnet
- Template gallery v2: PT, dietitian, med-spa packets; free downloadable PDF templates as SEO lead magnets
- Comparison pages (vs IntakeQ, vs Jotform HIPAA, vs paper) + 6 SEO articles on compliance-intent keywords
- SMS reminders live (10DLC approved); completion-rate stat on every dashboard
- Launch: therapist communities, private-practice podcasts/newsletters, Product Hunt

**Acceptance criteria:**

- [ ] Security review completed; all high/critical findings remediated before paid launch
- [ ] Self-serve funnel proven: 10+ practices reach a sent packet with zero human help
- [ ] 25 paying practices; trial -> paid >= 20%
- [ ] Aggregate patient completion rate >= 80% within 7 days of send (the metric the product sells)
- [ ] SMS reminders live with zero TCPA complaints; deliverability: bounce < 2%, complaint < 0.1%
- [ ] HIPAA-risk checklist converting >= 8% of visitors to emails
- [ ] Support load < 5 tickets/week per 25 practices; runbook for top 5 issues (BAA questions, template edits, patient link resends)

## Phase 3 -- Growth (Months 4-12)

Goal: $15k+ MRR, the Group/Clinic tiers earning their price, SOC 2 underway.

- Direct EHR import/export bridges (SimplePractice, TherapyNotes CSV round-trips first; APIs where they exist)
- Insurance-card capture block (photo upload + guided crop; OCR later)
- Telehealth consent bundle + state-specific consent packs (content moat)
- Practice analytics: completion funnels, time-to-complete, reminder efficacy
- API + webhooks out (intake.completed) for Clinic tier
- SOC 2 Type I engagement; cyber-liability insurance review
- Consultant/billing-service referral program (20% recurring)

**Acceptance criteria:**

- [ ] $15k MRR; logo churn < 2%/month over a trailing 3-month window
- [ ] >= 40% of new revenue from Group/Clinic tiers
- [ ] EHR bridge used by >= 30 practices; documented switch stories from IntakeQ/paper
- [ ] intake.completed webhooks consumed by >= 10 Clinic-tier practices
- [ ] SOC 2 Type I report issued (or a documented, dated remediation plan)
- [ ] Organic search delivers >= 40% of new trials; >= 3 referral partners each sending >= 2 paying practices
- [ ] Completion-rate case study published with real practice numbers (with permission), even if modest
