# SessionScribe

**AI-drafted progress notes (SOAP/DAP and modality templates) for solo therapists and counselors: record or upload session audio — or type shorthand — and a clinical draft is waiting for review before the next client sits down. The clinician always reviews, edits, and signs; nothing is ever auto-filed.**

## The Problem

Ask any solo therapist where their evenings go. Six or seven fifty-minute sessions a day, and every one of them owes the chart a note. The industry has a name for it — "pajama time": the two hours after dinner spent reconstructing sessions from memory into SOAP or DAP format, because insurance audits, licensing boards, and good clinical practice all demand documentation that the day left no room to write. The note backlog is the single most-cited administrative burden in private-practice surveys, a real driver of burnout, and the thing clinicians say they'd pay to make disappear.

The failure modes are worse than the hours. Notes written at 10pm from memory are thinner and less accurate than notes written at 3:05pm. Backlogs grow until a records request or an audit turns them into a crisis. And the common workarounds are bad: copy-paste template notes that would embarrass the clinician in front of a reviewer, or skipping the detail that protects them.

The EHR incumbents treat notes as a form to fill. The new AI scribes treat the clinician as a rubber stamp. SessionScribe's position is narrower and more honest: the AI writes the *draft*, in the clinician's chosen format and modality template, from the actual session — and the clinician's review-edit-sign pass is a designed, first-class step that can never be skipped. A note is not a note until a human signs it.

This is note-writing *after* sessions. Intake forms, consents, and screeners are a different product (see FormForge in this portfolio) — SessionScribe deliberately does not do intake.

## Target User

- **Primary:** solo licensed therapists and counselors in US private practice — LMFTs, LCSWs, LPCs, psychologists — seeing 15-35 clients/week, in-person or telehealth, cash-pay or paneled.
- **Secondary:** small group practices (2-5 clinicians) wanting one documentation standard and supervisor co-sign; pre-licensed associates whose supervisors must review notes anyway.
- **Buyer profile:** the clinician themselves. Clinically conservative, privacy-anxious for good reason, allergic to anything that "writes the chart for me" without their control. Buys when they see a real draft of a real session appear in their own format, with a review screen that respects their judgment.
- **Not a target (yet):** hospitals/CMHCs with enterprise EHR mandates, psychiatry/med-management documentation, group practices >10 seats.

## Market & Profitability

- **The category is proven and priced in public.** [Mentalyc sells AI therapy notes at $19.99-$69.99/mo by note volume](https://www.mentalyc.com/blog/upheal-vs-mentalyc); [Upheal charges $1/session capped at $69/mo](https://www.upheal.io/); and incumbent EHR [SimplePractice runs $49-$99/mo per practitioner with its AI Note Taker as a $35/mo add-on](https://www.mentalyc.com/blog/simplepractice-reviews). Therapists demonstrably pay $40-100/mo to make documentation go away.
- **The audience is large and reachable:** hundreds of thousands of licensed US therapists practice solo or in small groups, congregate in the same directories (Psychology Today), forums, and CE channels, and churn between tools over documentation pain specifically.
- **Willingness to pay is anchored to their own hourly rate.** A clinician billing $120-180/session who spends 6-8 hours/week on notes is burning $700+/week of billable-equivalent time; $69/mo is a rounding error against one recovered session.
- **Realistic ceiling:** **$15k-$80k MRR** over 2-3 years (250-1,300 clinicians at ~$60 blended ARPU). Churn risk is the EHRs bundling scribes — countered by being format-faithful, modality-aware, and better at the review moment than any bundled add-on (see Differentiation).
- **Margins:** ASR + LLM inference is the real COGS (~$0.10-0.30/session all-in at current pricing); at 100 notes/mo per clinician that's ~$10-30 against $69 — 55-85% gross margin on the heaviest users, >90% blended.

## Monetization & Pricing

Per clinician, tiered by monthly note volume — the honest scale axis, and the one the category already uses.

| Plan | Price | Volume | Includes |
|---|---|---|---|
| **Solo** | $39/mo | up to 40 notes/mo | Record/upload audio + shorthand notes, SOAP & DAP formats, review-edit-sign flow, signed-note PDF export, audit log |
| **Caseload** | $69/mo | unlimited notes | Everything in Solo + all modality templates (CBT, EMDR, couples, play, SFBT), custom template editor, treatment-plan-aware drafting, amendments |
| **Group** | $99/mo per clinician (min 2) | unlimited | Everything in Caseload + supervisor review & co-sign, practice-wide template standards, roster admin, org audit exports |

14-day free trial, full features, no card to start. Annual = 2 months free. BAA signed on all paid plans — including trial-to-paid conversion day one.

## MVP Feature List

- [ ] Auth + practice setup (Auth.js); clinician profile with credentials, default note format, and signature block
- [ ] Session capture, three ways: in-browser recording (telehealth or in-room), audio file upload, or typed shorthand ("worked on exposure hierarchy, client reported 4/10 anxiety, HW assigned")
- [ ] Transcription pipeline: HIPAA-eligible ASR (BAA'd provider), speaker separation, queued as a background job with visible progress
- [ ] AI note drafting: transcript or shorthand -> structured draft in the clinician's chosen format (SOAP or DAP at MVP), via a BAA'd LLM provider; per-section generation so a weak section regenerates alone
- [ ] Modality templates: CBT, EMDR, and couples templates that change what the draft attends to (interventions, SUDs ratings, relational dynamics); template picker per client with per-session override
- [ ] The review room: draft on the right, transcript excerpts on the left, every draft sentence traceable to its source span; edit inline; regenerate per section; nothing leaves this room unsigned
- [ ] Sign & lock: signature with credentials + timestamp + content hash; signed notes are immutable; amendments create a new version with its own signature — never edits in place
- [ ] Client list (PHI-minimal): display name/initials, modality, default template, session history — deliberately not a full EHR chart
- [ ] Audit log: every access, view, edit, export, and sign event with actor, timestamp, IP — surfaced to the clinician, not hidden
- [ ] Retention controls: audio and transcript auto-purge after a configurable window (default 30 days); the signed note is the durable record
- [ ] Export: signed-note PDF (per note or date range) for records requests and audits; plain-text copy for pasting into any EHR
- [ ] Billing (Stripe, three tiers, trial); usage meter on Solo

Post-MVP (explicitly cut from v1): scheduling/calendar, claims/superbills, telehealth video itself, treatment plan authoring, outcome measures, e-prescribing anything, direct EHR write-back integrations.

## Differentiation

1. **The review-sign moment is the product, not a checkbox.** Competitors demo generation; clinicians live in review. Source-traceable sentences, per-section regeneration, and a signing ritual that produces an immutable, hash-stamped record — built for the clinician who will someday sit across from an auditor.
2. **Never auto-filed, by architecture.** There is no code path from draft to record without a human signature. That is a compliance posture *and* the marketing message that wins the privacy-anxious buyer.
3. **Modality-aware, not generically clinical.** An EMDR note that tracks targets and SUDs, a couples note that names the dyad's pattern — drafts that sound like the clinician's school of practice, not like a medical scribe visiting a therapy session.
4. **HIPAA posture as a feature, in plain sight.** BAA on every paid plan, encryption at rest, auto-purged audio, and an audit log the clinician can read. The trust page is a product surface.
5. **Not an EHR, on purpose.** SessionScribe slots beside SimplePractice/TherapyNotes rather than fighting them — the note drafts anywhere, the signed PDF files anywhere. Switching cost to try it: zero.

## Go-to-Market Channels

1. **SEO on the pain, which clinicians type verbatim:** "SOAP note example therapy," "DAP note template," "how to write therapy notes faster," "AI progress notes HIPAA." Free, genuinely good note-format guides and template packs as lead magnets.
2. **Therapist communities:** r/therapists (documentation threads are perennial and enormous), Facebook groups for private-practice clinicians, state association newsletters.
3. **CE/consultant channel:** documentation-and-ethics CE presenters and private-practice coaches whose whole audience is this buyer; affiliate kit with honest claims only.
4. **Comparison pages:** vs Mentalyc, vs Upheal, vs SimplePractice's add-on, vs "writing them yourself at 10pm" — the last one is the honest anchor.
5. **The trial IS the close:** first session in, first draft out, reviewed and signed inside ten minutes — engineered as the activation metric.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Mentalyc** | [$19.99-$69.99/mo by note volume](https://www.mentalyc.com/blog/upheal-vs-mentalyc) | Category leader; validates pricing. Generation-first UX, thinner review/traceability story, templates less modality-deep. |
| **Upheal** | [$1/session, capped $69/mo](https://www.upheal.io/) | Pivoted into a full EHR — bundle gravity pulls focus from the note itself; heavier switch for clinicians happy with their EHR. |
| **SimplePractice AI add-on** | [$35/mo atop $49-99/mo plans](https://www.mentalyc.com/blog/simplepractice-reviews) | Only useful inside SimplePractice; scribe is an add-on, not a craft product; no modality depth. |
| **Autonotes / SOAP-generator tools** | ~$12-30/mo | Prompt-in-textbox tools: no audio pipeline, no audit trail, no signing model; fine for cash-pay corner-cutting, unfit for audit-grade practice. |
| **Writing it yourself** | Free | The real incumbent. Beaten by the 3:05pm draft and the arithmetic of one recovered evening per week. |

## Key Risks

1. **PHI is the whole product.** A breach is existential. Mitigation: BAA'd vendors only (ASR, LLM, DB, storage), encryption at rest and in transit, PHI-minimal client records, aggressive audio/transcript retention limits, no PHI in emails or logs, third-party pen test before launch.
2. **Clinical-quality failure — a hallucinated detail in a chart is harm.** Mitigation: source-traceable drafting (every sentence maps to transcript spans), conservative generation temperature, per-section regeneration instead of wholesale rewriting, and the mandatory human sign gate; marketing never claims the AI is the author of record.
3. **Recording consent varies by state and payer.** Two-party consent states make session recording legally sensitive. Mitigation: in-product consent tracking per client, consent script templates, and the shorthand path as a first-class no-audio alternative — not a degraded one.
4. **EHR bundling squeezes the category.** SimplePractice ships "good enough" scribes to a captive base. Mitigation: win the review moment and modality depth; stay EHR-agnostic so the product survives clinicians' platform churn; group/supervision features the add-ons ignore.
5. **Inference costs at unlimited tiers.** A heavy user could 10x COGS. Mitigation: per-note cost telemetry from day one, fair-use guardrails in terms, model routing (cheap models for shorthand expansion, premium for full-session drafts).

## Landing Page

Message architecture per MARKETING_PLAYBOOK.md (in this folder):

- **Enemy:** pajama time — the evening pile of unwritten notes that follows the clinician home.
- **One sentence:** the whole page proves *"The note finished before the next client sits down."*
- **The device:** the between-sessions clock. A session ends at 3:00. The draft is ready at 3:02. It is reviewed, edited, and signed by 3:07 — before the 3:10 client sits down. Hero shows the draft assembling section by section (S, O, A, P stamping in) against that clock; pricing and OG image reuse the 3:00 -> 3:07 arithmetic.
- **Proof beats:** a real (dogfood/permissioned, clearly framed) session draft with its traceability highlights; the signed-note artifact with hash + timestamp; the retention/BAA trust panel.
- **Objection killer:** "An AI wrote my chart?" -> No. It drafted; you signed. Show the sign gate and the audit log.
- **One CTA phrase, used verbatim everywhere (hero, post-proof, post-pricing, sticky mobile bar):** **"Start free — 14 days"**. De-risk line: no card required, BAA included.
