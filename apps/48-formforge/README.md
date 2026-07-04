# FormForge

**HIPAA-conscious patient intake for therapists and small clinics: structured forms, e-signatures, encrypted storage, and an audit trail you can hand to an auditor — without buying a whole EHR.**

## The Problem

A solo therapist or 3-clinician clinic onboards every new patient the same way: emailed PDFs, printed packets, a consent form signed in the waiting room, and a scanner. The failure modes are constant — forms come back half-filled, signatures go missing, PHI sits in a personal inbox (a HIPAA breach waiting for its discovery date), and the front desk re-types everything into whatever system holds the chart.

The existing fixes each fail a different way:

1. **Generic form builders** (Google Forms, Typeform) are flatly non-compliant for PHI — no BAA on standard tiers, no audit trail, no encrypted-at-rest guarantees a practice can point to.
2. **Full practice-management EHRs** solve intake only if you adopt the entire suite — billing, scheduling, notes — a heavy migration many cash-pay therapists and specialist clinics don't want.
3. **Paper** works until the packet is lost, illegible, or requested by a records auditor.

Intake is a bounded, painful, compliance-loaded workflow. It deserves a focused tool where the BAA, encryption, and audit log are the headline — not a footnote on an enterprise pricing page.

## Target User

- **Primary:** solo and small-group behavioral-health practices (therapists, psychologists, counselors) of 1-10 clinicians, especially cash-pay/out-of-network practices that skipped the big EHRs.
- **Secondary:** small specialty clinics with heavy intake burden — PT/OT, dietitians, med spas, functional medicine, dental — where the packet is 8+ pages of history and consents.
- **Buyer profile:** the practice owner or office manager. Non-technical, compliance-anxious, has read a HIPAA horror story. Buys the moment the product says "signed BAA, encrypted storage, audit log" in plain English and shows the intake packet working on a phone.
- **Not a target (yet):** hospital systems, multi-site groups with procurement, practices needing full EHR/e-prescribe integration on day one.

## Market & Profitability

- **The audience is large and growing.** The U.S. Bureau of Labor Statistics counts [roughly 400,000 substance-abuse, behavioral-disorder, and mental-health counselors, projected to grow ~19-20% through 2033](https://psychcentral.com/health/mental-health-professionals-us-statistics) — before adding psychologists, MFTs, and clinical social workers.
- **Healthcare non-clinical workflow tools command premium pricing.** [SimplePractice serves 225,000+ practitioners](https://www.ehrsource.com/vendors/simplepractice/) at [$29-$99/mo per clinician plus paid add-ons](https://www.simplepractice.com/pricing/), and [IntakeQ charges $49.90/mo for intake forms alone](https://intakeq.com/pricing) — proof that this exact buyer pays $50+/mo for intake when compliance is handled.
- **The category has momentum:** the global behavioral-health EHR market was [~$3.6B in 2024, forecast to grow at ~14.9% CAGR to 2034](https://www.towardshealthcare.com/insights/behavioral-health-ehr-software-market-sizing) — telehealth-era practices are digitizing paperwork first.
- **Category economics:** forms, signatures, and storage are cheap to serve (85-90% gross margin); compliance is the moat and the switching cost. Churn is low because intake links are embedded in the practice's website, EHR-lite exports feed their records, and re-training the front desk is a real cost. Realistic outcome: **$15k-$90k MRR** (200-900 practices at ~$75-100 blended ARPU) over 2-4 years.

## Monetization & Pricing

Priced per practice (not per clinician — the wedge against per-seat EHR pricing), tiered by clinician count and volume. **BAA included on every plan**, because gating compliance is the incumbent behavior this product exists to punish.

| Plan | Price | Practice size | Includes |
|---|---|---|---|
| **Solo** | $49/mo | 1 clinician | Unlimited forms & submissions, e-signature, encrypted storage, BAA, audit log, reminders, PDF export |
| **Group** | $99/mo | up to 5 clinicians | Everything in Solo + clinician assignment & routing, shared template library, intake status board, CSV/EHR-lite export |
| **Clinic** | $149/mo | up to 12 clinicians | Everything in Group + custom branding & domain, API access, SSO-lite (Google Workspace), priority support |

14-day free trial, no card required; template gallery (behavioral health, PT, dietitian) makes the first packet a 10-minute job. Annual = 2 months free.

## MVP Feature List

- [ ] Form builder from structured blocks (demographics, insurance, history, consent text, signature, file upload, screeners like PHQ-9/GAD-7 with auto-scoring) — configuration over drag-canvas
- [ ] Template gallery: complete intake packets per vertical, editable
- [ ] Patient-facing intake flow: tokenized link, mobile-first, save-and-resume, plain-language privacy notice
- [ ] Patient e-signature (typed or drawn) with timestamp, IP, and document-hash record on a legally attributable consent block
- [ ] Field-level encryption for PHI at rest (app-layer AES-GCM over encrypted Postgres) + encrypted file uploads (S3-compatible, SSE)
- [ ] Immutable audit log: every view, edit, export, and send recorded (who, what, when, from where) — surfaced in-app, exportable
- [ ] Automated reminders (email/SMS) until the packet is completed, with quiet hours
- [ ] Intake status board: sent / started / completed / signed, per patient, per clinician
- [ ] PDF export of completed packets (archival, records requests) + EHR-lite CSV export
- [ ] BAA: self-serve signing flow at signup; vendor-chain BAAs documented (hosting, email, SMS)
- [ ] Billing for FormForge itself (Stripe Billing, three plans, trial)

Post-MVP (explicitly cut from v1): direct EHR integrations (SimplePractice/TherapyNotes import-export), insurance-card OCR, telehealth consents bundle, multi-language forms, API, white-label.

## Differentiation

1. **Compliance as the headline, in plain English.** The marketing page and the product both lead with the BAA, the encryption model, and the audit log — with a one-page "how your data is protected" explainer the practice can forward to a nervous colleague. Incumbents bury this in legal pages.
2. **Intake-only, priced per practice.** No forced EHR adoption, no per-clinician tax. A 4-clinician group pays $99 flat where per-seat tools charge 3-4x that.
3. **Structured blocks, not a blank canvas.** Screeners score themselves, consent blocks carry signature + hash + audit semantics, demographics map to clean export columns. A drag-anything builder produces unstructured mush; blocks produce records.
4. **The audit log is a feature, not a log file.** "Show me everyone who viewed this patient's packet" is a two-tap answer — the exact question a records auditor or an anxious patient asks.
5. **Patient experience worth embedding.** Save-and-resume, 390px-first, readable consents. Completion rate is the metric practices feel weekly; we report it on the dashboard.

## Go-to-Market Channels

1. **SEO on compliance-intent keywords:** "HIPAA compliant intake forms," "HIPAA compliant online forms therapists," "PHQ-9 online form," "therapy intake packet template." High intent, weak content from incumbents, evergreen. Free downloadable packet templates (PDF) as lead magnets.
2. **Therapist communities and directories:** private-practice Facebook groups, r/therapists, private-practice podcasts and newsletters (sponsorships are cheap and precisely targeted); listings/integrations adjacent to Psychology Today profiles.
3. **The free HIPAA-risk checklist:** "Is your intake process compliant?" interactive audit — 10 questions, emailed results, converts the compliance-anxious.
4. **Consultant channel:** practice-launch consultants and billing services who set up new private practices; 20% recurring referral makes FormForge their default intake recommendation.
5. **Comparison pages:** "FormForge vs IntakeQ," "vs Jotform HIPAA," "vs paper packets" — switchers arrive pre-sold on the category.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **IntakeQ** | $49.90/mo forms; $79.90/mo w/ practice mgmt | The direct incumbent. Dated UI, per-practitioner add-on fees, weak audit-trail visibility; product energy has moved to the practice-management suite. |
| **SimplePractice / TherapyNotes** | ~$29-99+/mo *per clinician* | Full EHRs — intake requires adopting the suite; per-seat pricing punishes groups; overkill for cash-pay specialists. |
| **Jotform (HIPAA tier)** | ~$99+/mo (Gold) | Generic builder with HIPAA bolted on; no intake workflow (status board, routing, reminders-until-done), no screener scoring; compliance requires the right plan + settings — easy to get wrong. |
| **DocuSign / Dropbox Sign** | ~$25-40/user/mo | Signatures only — no forms, no PHI storage model, no intake pipeline. |
| **Paper + scanner** | ~Free | The real incumbent: familiar, "worked so far." Beaten by completion-rate math, lost-packet stories, and the records-request scenario. |

## Key Risks

1. **Compliance claims are load-bearing.** A security incident or an inaccurate HIPAA claim is existential in this niche. Mitigation: conservative architecture (field-level encryption, least-privilege access, immutable audit log), a third-party security review before charging, cyber-liability insurance, and marketing language reviewed against actual controls — never "HIPAA certified" (no such thing), always specific.
2. **Vendor BAA chain.** Every subprocessor touching PHI (hosting, email, SMS, storage) must sign a BAA. Mitigation: choose vendors with self-serve BAAs (AWS, Google Cloud, Twilio, Paubox-class email); document the chain publicly; SMS reminders contain no PHI (name + link only).
3. **Incumbent bundling.** SimplePractice can give intake away inside the suite. Mitigation: serve the practices that don't want the suite — cash-pay, specialists, groups allergic to per-seat pricing — and win on packet quality + patient completion rates.
4. **Low-price segment gravity.** Solo therapists are price-sensitive; support-heavy $49 customers can drown a small team. Mitigation: self-serve onboarding with template gallery, an excellent help center, and the Group/Clinic tiers as the revenue center.
5. **E-signature enforceability doubts.** Mitigation: ESIGN/UETA-standard attribution (intent, consent-to-sign disclosure, hash, timestamp, IP), an evidence summary attached to every signed PDF, and plain-language documentation.
