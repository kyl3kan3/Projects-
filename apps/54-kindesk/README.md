# KinDesk

**KinDesk is the family-care command center for the sandwich-generation daughter — shared tasks with owners, split expenses with receipts, one vault for the paperwork, and a weekly "state of Mom" digest that replaces four group texts.**

---

## The Problem

63 million Americans are family caregivers — up ~50% since 2015 — and three in five are women, average age 51, many raising kids at the same time. AARP calls it a "crisis point." The coordination tooling is group texts, four different spreadsheets, and a kitchen drawer:

1. **The coordinating daughter carries the whole system in her head.** Appointments, meds refills, the aide's schedule, who's visiting Sunday — scattered across texts, calls, and memory. Every sibling asks her for status because there is nowhere else to look.
2. **Money is the family fault line.** Who paid for the wheelchair ramp, who owes what for the aide — expense splitting among siblings is the single most notorious source of caregiving conflict, and it's run on screenshots of receipts in a thread.
3. **The paperwork is unfindable at the worst moment.** POA, insurance cards, advance directives, the Medicare summary — needed in an ER at 2 a.m., living in someone's filing cabinet three states away.
4. **The category king was killed.** CareZone — the best-loved consumer caregiving app — was acquired by Walmart and shut down in 2021 with no successor; survivors (ianacare) pivoted to B2B/Medicare. "Caregiving app" sits at keyword difficulty 20 with a $6.44 CPC and no brand on it.

KinDesk attacks all four with logistics — deliberately non-clinical. It is a household ops desk, not a health record.

## Target User

**The "adult daughter" running her parent's care, often from another city.** She's 45–60, coordinates two to four siblings (or does it alone and resents it), and is the one who knows everything. Research on caregiver tech adoption shows female caregivers have elevated willingness to pay, driven directly by care burden. She doesn't want a medical app — she wants the family to stop asking her for status.

Secondary: the sibling who wants to help but never knows what's needed; the solo caregiver using KinDesk as her own external brain.

## Market & Profitability

- **63M US family caregivers (AARP/NAC 2025), +50% in a decade; ~60% women; 29% sandwiched** between children and parents. 65% have never used a support service; 62% want coordination help.
- **The consumer shelf is empty.** CareZone (acquired ~$200M, shut down 2021) proved demand and then vanished; ianacare pivoted to the Medicare GUIDE program; CircleOf, Lotsa Helping Hands, and CaringBridge are dated, single-feature, or donation-run. "Caregiving app": KD 20, CPC $6.44, no category king.
- **Willingness to pay is documented** (JMIR caregiver-tech studies: female caregivers show elevated WTP proportional to burden), and the buyer is the wealthiest family member cohort (45–60) spending to reduce her own hours and conflict.
- **Retention has a built-in arc.** Caregiving episodes end — but the arc continues: aging parent → estate → widowed surviving parent. KinDesk's document vault and family structure carry directly into the next phase (the portfolio's AfterWords research thesis), giving unusually long family-account LTV.
- **Realistic revenue target: $8k–$60k MRR.** One payer per family at $9.99/mo; 3,000 paying families ≈ $30k MRR, reachable via the empty-SERP content channel ("sibling caregiving spreadsheet," "POA checklist") plus caregiver-community word of mouth.

Sources: AARP/NAC Caregiving in the US 2025 · CareZone shutdown coverage (Tech-Enhanced Life, CB Insights) · JMIR caregiver willingness-to-pay literature · DataforSEO Google Ads (US, June 2026) · full citations in the repo-level `WOMENS_NICHES_RESEARCH.md` (informational only; this folder is self-contained without it).

## Monetization & Pricing

One payer, whole family included. Managed via RevenueCat.

| Tier | Price | Trial | Includes |
|------|-------|-------|----------|
| Free | $0 | — | Solo desk: tasks, contacts, 10 vault documents, expense log (no splitting), digest preview |
| Family | $9.99 / month | 14-day free trial | Everything: unlimited vault, sibling task ownership & invites (share codes), expense splitting with receipts and balances, the shareable weekly digest, care-team contacts, backup export |
| Family Annual | $79.99 / year | — | Same; the committed-price fallback |

Paywall mechanics:

- Free is a genuinely useful solo organizer — the paywall moment is *inviting the first sibling* (the exact moment the product's value doubles) plus the 11th vault document and expense splitting.
- 14-day trial (longer than the portfolio norm) because the "aha" is a full week's cycle: tasks assigned, expenses logged, the Sunday digest sent.
- One subscription covers every family member; invited siblings never see a paywall. The payer is the coordinator — the person with the burden and the motive.

## MVP Feature List

- [ ] Onboarding: who are you caring for (first name only), are you coordinating siblings, seed checklist picker (new-diagnosis / hospital-discharge / moved-to-assisted-living / just-getting-organized)
- [ ] Task board: care tasks with **owner, due date, and status**; unowned tasks surface in a "needs an owner" strip; recurring tasks (meds refill every 30 days, sitter every Tuesday)
- [ ] Sibling invites via share code; members join free; every task/expense/document shows who added it
- [ ] Expense log with receipt photos (camera or library), category, and payer; **running balances per sibling** ("Dana is owed $214") with settle-up marking — arithmetic only, no payments processing
- [ ] Document vault: photograph or import (POA, insurance cards, directives, statements); titled, tagged, searchable; 10-doc free limit
- [ ] Care-team contacts: doctors, aides, pharmacy, neighbors — one tap to call, notes per contact
- [ ] Visit & decision log: dated entries ("we chose the Arden Court tour on 3/14 because...") — the family's memory
- [ ] The weekly **"state of Mom" digest** (signature): auto-assembled card — tasks done/upcoming, spend this week + balances, next appointments, one highlight note — rendered beautifully and shared as image/PDF to any thread
- [ ] Refill & appointment reminders via local notifications (reference list only — deliberately non-clinical, no dosing)
- [ ] Local-first storage: SQLite on device; family sync via end-to-end-encrypted relay (share-code-derived keys, expo-crypto) — the relay stores ciphertext only (see ARCHITECTURE)
- [ ] Paywall (RevenueCat): $9.99/mo + 14-day trial primary, $79.99/yr fallback; restore purchases; gates: first sibling invite, 11th document, expense splitting
- [ ] Backup export (JSON via share sheet) + delete-all-data
- [ ] Settings: reminder defaults, family members list, leave/transfer family, privacy explainer

## Differentiation

1. **Built for the coordinator, not "the caregiver."** Every design decision serves the daughter running the system: ownership on every task, balances she doesn't have to compute, a digest that answers "how's Mom?" before anyone asks.
2. **Expense splitting with receipts is first-class.** The notorious family-conflict point gets Splitwise-grade mechanics with receipts attached — no caregiving app does this.
3. **Deliberately non-clinical.** Meds are a reference list with refill reminders, not a MAR. No PHI posture, no FDA surface, no fake-medical UI — a household desk, which is also why a solo team can ship it.
4. **The digest is the growth loop.** Every Sunday a beautifully typeset card lands in a family thread with the KinDesk mark on it — the product markets itself to the exact people who should join.
5. **Privacy-honest sync.** Ciphertext-only relay, share-code-derived keys, no accounts beyond an opaque family ID. The family's business stays the family's business.

## Go-to-Market

- **Content SEO on the empty SERP:** "sibling caregiving expense spreadsheet," "shared caregiving calendar," "POA document checklist," "how to split parents' care costs" — long-tail with no incumbent brand, funneling to the app.
- **ASO:** "caregiving app" (KD 20), "family caregiver organizer," "elderly parent care app," "sibling care coordination."
- **Caregiver communities (earned):** r/AgingParents, r/CaregiverSupport, AARP forums, Facebook caregiver groups with six-figure memberships — genuine participation in the weekly "how do you all coordinate?" threads.
- **The digest itself:** every shared digest is a branded artifact in a family thread of prospective coordinators.
- **Partnership channel later:** geriatric care managers, senior-living move-in packets, hospital discharge planners ("give the family one desk").

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|------------|---------|-----------|------------|
| CareZone | — (dead) | Was the beloved consumer standard | Acquired by Walmart, shut down 2021; its orphaned users are the seed market |
| ianacare | Free (B2B-funded) | Care-team mobilization, employer/Medicare channel | Pivoted B2B (GUIDE); consumer app is a helper-mobilizer, no expenses/vault/digest |
| Lotsa Helping Hands | Free | Volunteer calendar for meal trains | Web-era UI, calendar-only, no money, no documents, no family ledger |
| CaringBridge | Donation | Health-update journals at scale | Broadcast journaling, not operations; no tasks/expenses/vault |
| Splitwise + Google Drive + group text (the real competitor) | Free | Familiar | The status quo being sold against: no ownership, no receipts-with-balances in context, no digest, nothing findable at 2 a.m. |

KinDesk's wedge: CareZone's warmth + Splitwise's balances + a vault + the digest, in one desk built for the coordinator.

## Key Risks

1. **Episodic retention.** Care episodes end. Mitigation: the arc design (vault and family persist into estate/afterwards), annual plan push at month 3, and honest pause/export paths that earn the next episode's return.
2. **Sync scope creep.** Real-time multi-writer sync is a tar pit. Mitigation: MVP syncs coarse-grained records (tasks, expenses, docs metadata) via last-write-wins on an E2E relay; conflicts are rare at family scale; documents sync as encrypted blobs. CloudKit fallback evaluated in Phase 2 for iOS-only cost savings.
3. **Clinical drift.** Meds features invite MAR/dosing expectations and regulatory surface. Mitigation: hard product line — reference list + refill reminders only; copy never instructs care.
4. **Free-rider families.** One subscription covers all; a sibling could run the family on the coordinator's trial. Mitigation: trial converts at the moment of proven value; the payer is structurally the motivated party.
5. **Sensitive-data trust.** POA and financials in an app requires visible security posture. Mitigation: E2E architecture explained in plain language in Settings, ciphertext-only relay, local export, no analytics SDKs.
