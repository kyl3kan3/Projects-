# StimTrack

**StimTrack is the local-first IVF and egg-freezing treatment manager that never loses a dose, never lets the trigger shot slip, and never says the wrong thing after a loss — because in a $20,000 cycle, reliability is the product.**

---

## The Problem

Roughly 1 in 6 people face infertility, IVF and egg-freezing volumes are climbing steeply (egg-freezing cycles +39% YoY), and the software these patients run their treatment on is either a clinic portal built for the clinic, a general fertility app built for conception prediction, or a beta-grade indie tracker. Five specific failures:

1. **The category leader loses data mid-treatment.** Embie — the best-known IVF tracking app — has paying users leaving 1-star reviews for data loss in the middle of a stim cycle, unreachable support, notification "alarm stacking," and an app that "feels like beta." Patients doing 3–5 injections a day on exact schedules describe rebuilding their med calendar in Notes because they stopped trusting the app. In this niche a sync failure isn't an inconvenience; it's a $20,000 cycle at risk.
2. **The trigger shot has no dedicated instrument.** The trigger injection must land at an exact clinic-assigned time (typically 34–36 hours before retrieval); early or late by even an hour can compromise the retrieval an entire cycle was building toward. Patients set 4 phone alarms, ask partners to call them, and still post retrieval-eve panic threads. No app treats this one event with the criticality it carries — a countdown, redundant escalating reminders, and a confirmation loop that doesn't stop until the shot is confirmed.
3. **The egg-freezing lifecycle has no owner at all.** Pre-cycle prep → stim tracking → retrieval → storage-fee management → (years later) thaw decisions. After retrieval, freezers get an invoice for $500–$1,200/year of storage and manage it via a clinic's billing department and their own memory. There is no product that carries a freezer from consult through the years of storage decisions. StimTrack's cycle model, storage tracker, and annual renewal reminders own that arc.
4. **Fertility software is structurally loss-blind.** 72% of 166 reviewed pregnancy apps do not account for pregnancy loss at all; app-store reviews describe logging a miscarriage as a "period" just to silence baby-size notifications. IVF has failed transfers, cancelled cycles, chemical pregnancies, and losses at every stage — and the incumbent apps keep cheerfully notifying through all of them. A true "cycle ended" / "pregnancy ended" state that silences everything, recalibrates the interface, and handles the next cycle correctly is both the moral and the commercial differentiator.
5. **The data the clinic needs lives in screenshots.** Monitoring appointments generate E2 levels, follicle counts per ovary, and lining measurements that patients transcribe into spreadsheets from portal screenshots to answer "how does this cycle compare to my last one?" — and second-opinion consults ask for exactly this history. Nobody hands the patient a clean, doctor-ready cycle summary.

StimTrack attacks all five with an offline-always local-first architecture, a protocol calendar built around the events that actually structure a cycle, a trigger-shot engine that cannot be ignored, a storage-fee tracker with multi-year memory, loss-aware states throughout, and a one-tap cycle summary PDF.

## Target User

**The IVF or egg-freezing patient in an active cycle.** She is typically 32–42, spending $15,000–$25,000 out of pocket per cycle (an app subscription is a rounding error against a single Gonal-F pen), managing 2–5 daily injections with dose changes after every monitoring appointment, and running her treatment on a clinic paper calendar, a wall of phone alarms, and a spreadsheet. She is the highest-intent user in all of femtech: her timeline is measured in days, her stakes in five figures, and her tolerance for flaky software is zero — she reads reliability complaints in reviews before installing.

Secondary: the egg freezer (often younger, employer-benefit-funded, +39% YoY and the fastest-growing entry point) whose relationship with the product continues for years of storage fees after a single stim cycle; the partner who wants the calendar and the trigger time on their own phone (roadmapped, not MVP); the patient between cycles comparing protocols before a second opinion.

## Market & Profitability

- **Volume is growing and concentrated in payers.** Egg-freezing cycles are up 39% YoY and the egg-freezing/embryo-banking market is projected to roughly double to $10.8B by 2030. IVF patients spend $15–25k per cycle out of pocket — the willingness-to-pay context of every subscription decision.
- **The demand side is high-intent by construction.** Every user is in or approaching a medically scheduled, five-figure event with a hard calendar. Life-event apps out-monetize lifestyle apps precisely because of this urgency (the same pattern that let Hello Divorce grow 100% YoY while broad "for women" products died) — and IVF is the most tightly scheduled life event in this research.
- **The incumbent is beatable on reliability alone.** Embie's own paying users report data loss mid-treatment, unreachable support, and alarm stacking. Meanwhile fertility *prediction* (the saturated, FDA-cleared, KD-75 side of the category) absorbed 44% of 2025 femtech funding while journey *management* was left unowned — VC moved to biotech and vacated the app lane.
- **The egg-freezing lifecycle adds multi-year LTV to an episodic event.** A stim cycle lasts weeks, but storage lasts years: annual storage invoices ($500–$1,200/yr) give StimTrack a recurring, calendar-anchored reason to exist long after retrieval — the retention answer most life-event apps never find.
- **Costs are near zero.** All treatment data lives on device; there is no backend (see ARCHITECTURE.md). Infra ≈ $0; gross margin is store-commission-bound.
- **Realistic revenue target: $10k–$80k MRR** (research rank #2 of 12). At $79/yr with cycle-pass entry pricing, ~1,500 active subscribers ≈ $10k MRR; the storage-tracker tail compounds annual renewals.

Sources: Mordor Intelligence egg-freezing/embryo-banking market report · Embie Play Store reviews · The Conversation / pregnancy-loss app research (72% figure) · Galen Growth & New Market Pitch femtech funding analyses · RevenueCat State of Subscription Apps 2026 · full citations in the repo-level `WOMENS_NICHES_RESEARCH.md` (informational only; this folder is self-contained without it).

## Monetization & Pricing

Event-priced during the cycle, annual for the long arc (storage years), managed via RevenueCat.

| Tier | Price | Trial | Includes |
|------|-------|-------|----------|
| Free | $0 | — | Protocol calendar (current cycle), 3 medications with reminders, scan/labs log (current cycle), loss-aware states (never paywalled) |
| Cycle Pass | $24.99 one-time (90 days) | — | Everything below for one cycle window — for the "I just need to get through this cycle" buyer |
| Plus Monthly | $9.99 / month | — | Everything: unlimited meds, trigger-shot engine extras, unlimited cycle history + comparison, storage-fee tracker, cycle summary PDF, CSV export |
| Plus Annual | $79 / year | 7-day free trial | Same as monthly; the storage-years tier — presented first once a retrieval is logged |

Paywall mechanics:

- The free tier must be genuinely safe to run a cycle on: calendar, core reminders, and every loss-aware behavior are free. **Loss handling is never a premium feature** — charging to grieve correctly would be both wrong and brand-fatal.
- Paywall triggers at high-intent moments: adding a 4th medication (typical stim protocols need it), starting a second cycle (history + comparison), logging a retrieval (storage tracker offer), tapping "Cycle summary PDF," opening a compare view.
- The Cycle Pass is the honest entry product for an episodic event; the post-retrieval upsell to Annual ("your storage renewal is a yearly event now") converts the episode into the long arc.
- The reliability architecture is paywall copy: "Your protocol lives on this phone, works in airplane mode, and exports whenever you want. No account. No server to lose it."

## MVP Feature List

- [ ] Onboarding: cycle type (IVF fresh transfer / freeze-all / egg freezing / FET / just exploring), clinic-calendar quick entry (baseline date, tentative retrieval window), meds picker from the bundled fertility-med library; lands on the paywall only after the calendar and first reminders exist
- [ ] Protocol calendar: the cycle as a day-indexed timeline — stim days, monitoring/scan days, trigger day, retrieval, transfer or freeze day, beta day; each day shows its meds, appointments, and instructions-to-self; fully editable because clinics change everything mid-cycle
- [ ] Medication engine: bundled library of fertility meds (Gonal-F, Follistim, Menopur, Cetrotide, Ganirelix, Lupron, hCG/Ovidrol triggers, progesterone in oil, estradiol, etc.) + custom meds; per-med schedules with dose, route, and time; dose changes are dated events preserved in history
- [ ] Med reminders, redundant by design: primary local notification + escalating repeat until logged; "Taken / Skip" actions from the notification; overdue state visible on Today
- [ ] **Trigger-shot engine (the hero):** exact clinic-assigned time to the minute; full-screen countdown; escalating reminder ladder (T−24h, T−4h, T−1h, T−15m, T−0, then repeating nag); a confirm-loop that requires explicit "Confirmed — injected" and re-alerts until it gets it; post-confirm timestamp recorded for the retrieval record
- [ ] Scans & labs log: per-appointment entry — E2, LH, P4 values with units; follicle counts and sizes per ovary; lining thickness; charted across the cycle so "how am I responding?" has a picture
- [ ] Storage-fee tracker: what is stored (eggs/embryos, counts), where, since when, annual fee, renewal date; local notification 30 days and 7 days before each renewal; multi-facility support
- [ ] Appointment prep notes: per-appointment question list, written at 2 a.m., surfaced at check-in time
- [ ] Cycle summary PDF: one tap → the cycle on one page — protocol timeline, med history with dose changes, E2/follicle progression table and chart, retrieval/transfer outcomes — rendered on device, shared via the system sheet (built for second opinions and clinic handoffs)
- [ ] **Loss-aware states (never paywalled):** "cycle cancelled," "no fertilization," "transfer failed," "pregnancy ended" — one action silences every reminder and celebration instantly, archives the cycle respectfully (data kept, never deleted without consent), switches copy to neutral register, and offers a quiet "when you're ready" re-entry; the next cycle starts clean
- [ ] Cycle states machine: planning → stimming → trigger → retrieval → transfer/freeze → waiting → ended (with typed outcomes); every screen renders correctly in every state
- [ ] Local-first storage: SQLite on device; user-controlled JSON backup/export; **zero accounts, zero analytics SDKs, zero third-party trackers**; everything except purchase works in airplane mode
- [ ] Paywall (RevenueCat): Cycle Pass + Monthly + Annual w/ 7-day trial; restore purchases; free-tier gates as specified above
- [ ] Settings: reminder defaults and quiet hours (which never apply to the trigger ladder), export/backup, delete-all-data, the reliability explainer ("Try it: airplane mode. Everything works.")
- [ ] Bundled reference content: 25 plain-language explainer cards (what E2 means at monitoring, what a trigger shot does, storage-fee questions to ask) — each cites clinical sources (ASRM/HFEA-grade); educational only, never protocol or dosing advice

## Differentiation

1. **Reliability as the product.** Local-first SQLite, offline-always, no account, no sync dependency, redundant reminders — architecturally incapable of Embie's failure mode (server-side data loss mid-cycle). The app tells users how to verify it: airplane mode works forever.
2. **The trigger shot is a first-class object.** No incumbent treats the single most expensive minute in fertility medicine as anything more than another reminder row. StimTrack's countdown + escalation ladder + confirm-loop is the feature patients will screenshot, and "the $20,000 reminder" is the marketing device.
3. **Loss-aware by design, end to end.** One tap ends a cycle or pregnancy with dignity: total silence, neutral copy, respectful archive, correct handling of the next cycle. The 72%-loss-blind category statistic makes this both the moral high ground and a switching trigger quoted in incumbents' own reviews.
4. **Owns the egg-freezing lifecycle.** Pre-cycle prep through years of storage fees and eventual thaw decisions — a lifecycle with no owner, a growing (+39% YoY) entry cohort, and a built-in annual retention event (the renewal invoice).
5. **The cycle summary PDF.** The universal femtech wedge (log + remind + correlate + report) applied to the one niche where every patient literally pays for second opinions: a clean one-page cycle history no portal produces.
6. **Wellness-safe on purpose.** Log, remind, chart, educate — never generate protocol advice, never suggest doses, never predict outcomes. The clinic's instructions are the source of truth; StimTrack is the instrument that executes them faithfully.

## Go-to-Market

- **The communities are dense and searchable.** r/IVF, r/eggfreezing, r/infertility and their Facebook/Discord equivalents run daily "how do you keep track of your meds?" and trigger-shot panic threads. Genuine participation plus the shareable trigger-countdown and cycle-summary screenshots. This audience actively warns each other off unreliable apps — reliability positioning does the selling.
- **ASO against a weak incumbent.** Title/subtitle: "StimTrack: IVF & Egg Freezing" / "Protocol calendar, meds & trigger". Keywords: ivf tracker, ivf medication, egg freezing app, stim cycle, trigger shot, fet calendar. Competitor terms (embie) are cheap and high-intent given the review sentiment.
- **Content SEO on the questions every cycle asks:** "trigger shot timing," "what should E2 be at day 7," "egg freezing storage fees," "IVF medication schedule" — long-tail, high-intent, poorly served by clinic PDFs; each article funnels to the app.
- **The clinic-adjacent channel:** fertility pharmacies and injection-teaching nurses hand patients med calendars today; a printable "your med calendar, on your phone, works offline" one-pager targets that hand-off moment. (No clinic integrations — see ARCHITECTURE.md non-goals.)
- **Employer-benefit tailwind:** Carrot/Progyny/Kindbody benefits are funding the egg-freezing boom; content targeting "using your fertility benefit" reaches the fastest-growing cohort at decision time.
- **Press angle:** "The fertility app that plans for the worst day, not just the best one" — loss-aware design is a story health journalists already write about (the 72% studies gave them the peg).

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|------------|---------|-----------|------------|
| Embie | Free + subscription | Category-leading brand recognition, IVF-specific features, community goodwill (once) | Paying users report data loss mid-treatment, unreachable support, alarm stacking, "feels like beta"; server-dependent architecture is the failure mode |
| Ovia Fertility (+ Glow, WhatToExpect et al.) | Free (data-monetized) / subs | Big installed bases, polished conception content | Built for TTC prediction, not treatment execution; loss handling is the subject of their own 1-star reviews (logging a miscarriage as a "period"); ad/data business models this audience distrusts |
| Clinic patient portals (e.g. eIVF, Salve-based apps) | Free to patient | Authoritative: the actual orders and results | Built for the clinic, not the patient: no med reminders worth the name, no cross-clinic history, nothing after discharge, unusable for storage-fee life |
| Medisafe / generic pill reminders | Free / $39.99/yr | Mature reminder engine | No cycle model: no protocol calendar, no scans/labs, no trigger criticality, no loss states — meds are the only noun it knows |
| Paper calendar + spreadsheet + 4 phone alarms | Free | Total control; never breaks | The status quo StimTrack replaces — no escalation, no history, no summary, transcribed from portal screenshots at midnight |
| Fertility Friend / Natural Cycles | ~$40–120/yr | Strong at ovulation prediction (FDA clearance, in NC's case) | Prediction products; structurally irrelevant once treatment starts — a medicated cycle overrides everything they model |

StimTrack's wedge: Embie's feature ambition on an architecture that cannot lose data + the trigger-shot engine nobody has + the loss-aware design 72% of the category ignores + the egg-freezing lifecycle no one owns.

## Key Risks

1. **Medical-device line.** A protocol calendar drifts toward regulated territory the moment it *generates* medical direction. Mitigation: hard rule — the app never computes, suggests, or adjusts protocols, doses, or timings; every schedule and every trigger time is user-entered from clinic instructions, and the UI says so ("as instructed by your clinic"); reference cards educate with citations and never instruct. Review all copy against FDA general-wellness guidance.
2. **A missed trigger blamed on the app.** The nightmare scenario, reputationally and morally. Mitigation: redundant scheduled notifications (the full ladder pre-registered, not dependent on the app waking), confirm-loop until acknowledged, prominent in-app countdown, explicit onboarding guidance to keep clinic-recommended backup alarms, honest disclaimers that no phone notification is guaranteed by the OS; the Week-1 ROADMAP spike proves the ladder works with the app killed, and launch blocks on it.
3. **Grief-adjacent product decisions.** Getting loss states wrong — a cheerful notification after a failed transfer, a paywall between a user and silence — would be catastrophic in communities this connected. Mitigation: loss flows free forever, copy reviewed by users with lived experience during TestFlight, one-tap total silence guaranteed, no data deleted without explicit consent, no re-engagement prompts to ended cycles.
4. **Episodic churn.** Cycles end; subscribers lapse. Mitigation: the Cycle Pass prices the episode honestly instead of fighting it; storage-fee tracking converts freezers to annual retention; multi-cycle reality (most IVF patients need >1 cycle) makes history/comparison the resubscribe reason; win-back is a calendar event (the renewal reminder), not a nag.
5. **Platform notification limits.** iOS caps pending local notifications (64) and can defer delivery; a med-heavy protocol plus the trigger ladder must fit. Mitigation: scheduling engine budgets notifications (nearest-first, re-registered on every app open and every log), trigger ladder gets absolute priority, and the ROADMAP spike validates behavior on physical devices before anything else is built.
6. **RevenueCat/paywall dependency.** All revenue through one SDK. Mitigation: entitlements cached locally so an outage degrades to "Plus stays unlocked"; pricing experiments via offerings, not app updates.
