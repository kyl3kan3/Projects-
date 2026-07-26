# SplitKit

**SplitKit is single-player divorce operations for women — a state-aware financial-discovery checklist, an on-device asset inventory and document vault, a tamper-evident communication log with court-ready PDF export, and settlement arithmetic worksheets — built for the chaotic 12–24 months of separation that no co-parenting app touches, gray divorce first.**

---

## The Problem

Gray divorce (50+) has doubled since 1990, women initiate more than 60% of it, and the software category serving divorce is built for a different moment and a different buyer. Five specific failures:

1. **The separation window itself has no tool.** The chaotic 12–24 months between "I'm done" and a signed decree — gathering statements, inventorying twenty years of accounts, documenting what he said on Tuesday — is served by nothing. Every incumbent (OurFamilyWizard, AppClose, TalkingParents) is a *post-decree co-parenting* messenger. The event with the deadline and the dollars at stake is orphaned.
2. **Two-party by design means dead-on-arrival.** OurFamilyWizard costs $150–300/yr *per parent* and sits at 1.5–2.1 stars; it requires the ex to sign up, pay, and behave. A woman leaving a marriage cannot make her counterparty adopt software. Any tool that needs his cooperation fails exactly when she needs it most.
3. **The gray-divorce woman doesn't exist to these apps.** No minor children means no custody calendar means the entire co-parenting category is structurally irrelevant to her — while she faces the highest financial stakes: a ~45% drop in standard of living after gray divorce, pensions and retitling and beneficiaries the apps have never heard of.
4. **91% get no financial advice.** Ninety-one percent of divorcing women seek no financial advice before or during the divorce. They walk into mediation not knowing what accounts exist, what's marital vs. separate, or what keeping the house actually costs. The discovery, inventory, and arithmetic work is undone — not because it needs a professional, but because nothing sequences it.
5. **The evidence lives in a shoebox.** "He agreed to pay the property taxes" lives in memory; the screenshot of the threatening text is in a camera roll next to 4,000 photos; the statement photographed at the kitchen table is findable by no one. When her lawyer asks "do you have that in writing?", the answer is a weekend of panic. Notes apps have no timestamps that hold up, no organization, and no export.

SplitKit attacks all five as a single-player instrument: no counterparty, no network effects, no permission needed from anyone — checklists, a vault, a hash-chained log, and worksheets, all on her device.

## Target User

**The 48–62-year-old woman initiating or absorbing a gray divorce.** She is in the separation-to-decree window, often out of the workforce or the household's financial back seat, facing a marital estate of accounts, a house, and one or two pensions she has never inventoried. She has no minor children at home (or grown ones), so the entire co-parenting category ignores her. She is scared, methodical when given a method, and highly motivated: the event has a deadline and six figures at stake. She will not put this data in a cloud her spouse might reach, and she may share a phone plan, an iPad, or an iCloud account with him — privacy from one specific person is a purchase criterion.

Secondary: the younger divorcing woman (30s–40s, kids or not) in the same pre-decree window — everything except the pension-heavy content applies; the woman post-decree working the rebuild checklist (credit, retitling, beneficiaries).

## Market & Profitability

- **The event, not the lifestyle, unlocks payment.** Life-event products for this demographic grow where lifestyle brands die: Hello Divorce grew 100% YoY on event-specific products while Ellevest's broad "finance for women" robo exited the mass market. Divorce arrives with urgency, a deadline, and quantifiable dollars — the exact conditions under which this buyer pays monthly without flinching.
- **The demographic is large, growing, and initiating.** Gray divorce has doubled since 1990 and women initiate 60%+ of it. These are the wealthiest divorces (longest marriages, largest estates) with the worst outcomes for women: a ~45% standard-of-living drop, and 91% receiving no financial advice before or during. The need is documented; the tooling is absent.
- **Price tolerance is proven by a hated incumbent.** OurFamilyWizard extracts $150–300/yr *per parent* at 1.5–2.1 stars — people pay it because courts order it and the stakes justify it. SplitKit's $14.99/mo event pricing / $99/yr sits inside a proven band while serving a phase and a buyer OFW structurally cannot.
- **Single-player design de-risks the whole category.** The divorce-app graveyard is two-party tools that need the ex to participate. Checklists, vaults, timestamped logs, and PDF exports have no counterparty, no network effects, no liquidity problem — the same structural bet that makes the adjacent documentation niche work (VictimsVoice proves $39.99/yr for admissibility-oriented logging alone).
- **Natural expansion chain.** The tamper-evident log engine is shared with the abuse-documentation niche (HavenLog pattern); the post-decree rebuild content bridges to the finance layer; the same 45–65 meta-customer flows to caregiving (KinDesk) and widowhood (AfterWords). One brand can own the sequence.
- **Realistic revenue target: $10k–$80k MRR.** Event pricing at $14.99/mo with a 12–24-month event duration means one subscriber is worth $180–360 — SaaS-grade LTV in a consumer app. 2,000 concurrent event-phase subscribers ≈ $30k MRR. Infrastructure cost is ≈ $0: all data on device, no backend (see ARCHITECTURE.md).

Sources: WOMENS_NICHES_RESEARCH.md (repo root; informational only — this folder is self-contained without it) · CNBC — gray divorce financial risk for women · Forbes — women 45–65 reframing divorce · BestInterest — OurFamilyWizard review synthesis · Hello Divorce growth reporting · VictimsVoice pricing · RevenueCat State of Subscription Apps 2026.

## Monetization & Pricing

Event-monthly first (divorce is a deadline, not a lifestyle), annual for the long arc, managed via RevenueCat.

| Tier | Price | Trial | Includes |
|------|-------|-------|----------|
| Free | $0 | — | State-aware checklist (first section), asset inventory up to 10 items, 10 log entries, 5 vault documents, 1 settlement scenario, app lock |
| Event Monthly | $14.99 / month | 7-day free trial | Everything: full checklist, unlimited inventory/log/vault, court-ready PDF export, unlimited scenarios, encrypted backup export, rebuild plan, reminders |
| Annual | $99 / year | — | Same; positioned for the realistic 12–24-month arc ("most divorces take longer than you think — this is the cheaper way through") |

Paywall mechanics:

- The free tier must genuinely start the job — the first checklist section, a real inventory, the first log entries — because this buyer is in crisis and distrustful; the app earns the subscription by producing order within ten minutes.
- Paywall triggers at high-intent moments: the 11th log entry, the 6th vault document, tapping **Export court-ready PDF**, opening a second scenario worksheet, opening the rebuild plan.
- Monthly-with-trial is presented first (matches the event mindset); annual is the same-screen value fallback with the duration-honesty framing. RevenueCat offerings keep the mix remotely tunable.
- The privacy architecture is paywall copy: "Everything stays on this phone, behind your face or PIN. No account. No cloud he can subpoena a password reset for. That's also why there's no ad tier."
- No fake urgency, no countdown timers — this user has enough of both.

## MVP Feature List

- [ ] Onboarding: state picker (all 50 US states + DC), stage picker (considering / separating / filed / post-decree), children y/n, app-lock setup first (biometric/PIN before any data entry); lands on the paywall only after first value (first checklist section done or first log entry sealed)
- [ ] App lock: FaceID/TouchID with PIN fallback via expo-local-authentication; auto-lock on background; required, not optional
- [ ] Financial-discovery checklist: ~60 sequenced tasks across sections (identify accounts, gather statements, tax returns, insurance, titles/deeds, pensions/retirement, debts, safe-deposit/valuables), each state-aware (community-property vs. equitable-distribution branch, state disclosure-form names, waiting-period note) — informational only, never advice
- [ ] Asset & account inventory: name, kind (bank / retirement / pension / real estate / vehicle / debt / insurance / business / other), institution, last-4, titling (joint / hers / his / trust / unknown), estimated value, marital/separate/unknown flag, notes; running totals by titling and flag (arithmetic only, no characterization advice)
- [ ] Document vault: capture photos (statements, deeds, prenups, pay stubs) or import files; each document SHA-256 hashed at capture with timestamp; linkable to inventory assets; stored in the app sandbox on device, never uploaded
- [ ] Communication & incident log: timestamped entries (occurred-at + entered-at, both recorded), channel, participants, summary, detail; each entry sealed into a hash chain (entry hash includes the previous entry's hash) — the "entered into the record" moment
- [ ] Court-ready PDF export (paid): chronological log with both timestamps, per-entry hash line, and a chain-verification digest footer explaining the tamper-evidence method in plain language; rendered on device via expo-print, shared via the system sheet — formatted for legal review, never described as "admissible"
- [ ] Settlement scenario worksheets (arithmetic only): House (keep-vs-sell: buyout math, carrying cost, break-even), Pension split (marital-fraction arithmetic on user-entered numbers), Support cash-flow (monthly in/out under user-entered assumptions); every worksheet footed with "Arithmetic on your numbers — not a valuation, not advice. Bring it to your attorney or a CDFA."
- [ ] Post-decree rebuild plan: sequenced checklists for credit (report pull, joint-account closure), retitling (house, vehicles), beneficiaries (retirement, insurance, will/estate), name change; unlocks at the post-decree stage
- [ ] Reminders: local notifications for user-set deadlines (disclosure due dates, document-gathering nudges, rebuild follow-ups); no server
- [ ] Encrypted backup export (paid): full DB + vault files serialized and AES-encrypted with a user passphrase, shared as a file she controls; restore-from-file in Phase 2
- [ ] Local-first storage: SQLite + sandboxed files on device; **zero accounts, zero analytics SDKs, zero third-party trackers**; the only network calls are store billing and RevenueCat
- [ ] Paywall (RevenueCat): $14.99/mo + 7-day trial primary, $99/yr fallback; restore purchases; free-tier gates as specified above
- [ ] Settings: state/stage change, reminder times, export/backup, delete-all-data (with confirmation), the "not legal advice" disclosure, privacy explainer ("airplane mode: everything works"), restore
- [ ] Education cards: 20 bundled, cited explainers (community property vs. equitable distribution, what a QDRO is, what discovery means, CDFA vs. attorney roles, credit after divorce) — each citing official or authoritative sources; educational only, never advice

## Differentiation

1. **Single-player where every incumbent is two-party.** SplitKit requires nothing from the ex: no invite, no fee, no cooperation. It works on day zero, in secret if necessary, for the woman with no minor children the co-parenting category cannot even onboard.
2. **Built for the separation window, not post-decree.** Discovery checklists, inventory, and documentation are the work of the 12–24 months *before* the decree — the phase with the deadline and the dollars, which OFW/AppClose/TalkingParents structurally skip.
3. **The record they can't argue with.** Timestamped, hash-chained entries and hashed documents, exported as a clean chronological PDF with a verification digest. When her lawyer asks "do you have that in writing?", the answer is one tap. This is the hero feature and the screenshot the product markets itself on.
4. **Arithmetic without advice.** The worksheets do the math 91% of divorcing women never see — buyout numbers, marital-fraction pension splits, monthly cash-flow — as pure arithmetic on her numbers, with a hard non-advice boundary that keeps the product solo-buildable and regulator-safe.
5. **Privacy from one specific person, architecturally.** On-device data behind a mandatory app lock, no account to discover, no cloud to subpoena or guess a password to, verifiable in airplane mode. Incumbents with accounts and messaging servers cannot copy this posture.
6. **Gray-divorce-native content.** Pensions, QDROs, retitling, beneficiaries, credit rebuilt at 55 — the estate of a 25-year marriage, not a custody calendar.

## Go-to-Market

- **Content SEO on the question layer.** A companion content site targeting the long-tail questions this buyer searches at 2 a.m.: "divorce financial checklist," "gray divorce pension split," "how to document conversations for divorce," "what is a QDRO," "divorce after 50 finances" — each page funneling to the app. The co-parenting incumbents do not compete on pre-decree queries.
- **ASO.** Title/subtitle: "SplitKit: Divorce Checklist" / "Organize, document, prepare". Keywords: divorce checklist, divorce app for women, gray divorce, divorce documentation, separation checklist, divorce finances. Category terms are low-competition because the incumbents all optimize for "co-parenting."
- **Attorney & CDFA channel.** Family-law attorneys and Certified Divorce Financial Analysts constantly tell clients "keep a log, gather your statements, make a list of accounts." A printable one-pager for their intake packet: "Your attorney asked you to get organized — here's the tool." The court-ready PDF is designed to make lawyers recommend the app.
- **Communities (earned, not ads).** r/Divorce, r/DivorceOver40/50 threads, gray-divorce Facebook groups, and divorce-coach newsletters run recurring "how do I get organized / how do I document" threads currently answered with spreadsheet links. Genuine participation plus the shareable checklist screenshot.
- **Apple Search Ads** on competitor and category terms (ourfamilywizard, divorce app, co-parenting app) — pre-decree intent is cheap because nobody serves it.
- **Press angle:** "The divorce app that doesn't need your ex" and the 91%/45% statistics ride every gray-divorce trend piece (a recurring national-media topic) for free.

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|------------|---------|-----------|------------|
| OurFamilyWizard | $150–300/yr **per parent** | Court-ordered adoption, ToneMeter, long history | 1.5–2.1★; two-party by design (needs the ex enrolled and paying); post-decree co-parenting only; useless without minor children; nothing for financial discovery or the separation window |
| TalkingParents | Free tier + ~$6–25/mo | Unalterable messaging record, court-record positioning | Two-party messaging tool; requires the ex; no financial discovery, no inventory, no vault, no gray-divorce relevance |
| AppClose | Free | Free, co-parenting basics | Two-party; ad/upsell model; co-parenting calendar focus; no documentation rigor, no financial layer |
| Hello Divorce | $500–2,500+ per plan/service | Proven event-product demand (100% YoY growth), legal-plan depth | A legal-services marketplace, not an ops tool; web-first; episodic engagement ends at filing; doesn't do daily documentation, inventory, or a vault on her phone |
| VictimsVoice | $39.99/yr | Proves willingness to pay for admissibility-oriented logging | DV-documentation only; web app; no financial discovery, inventory, scenarios, or divorce sequencing |
| CDFA / divorce financial planners | $150–400/hr | Real personalized advice | Human, expensive, and 91% of divorcing women never engage one; SplitKit is the on-ramp, not the substitute |
| Notes app + spreadsheet + camera roll (the real incumbent) | Free | Zero friction, already installed | No timestamps that hold up, no hashing, no organization, no export, no sequencing, no state awareness — the shoebox SplitKit replaces |

SplitKit's wedge: the only single-player, pre-decree, gray-divorce-native instrument — documentation rigor no notes app has, financial sequencing no co-parenting app has, at consumer price no professional matches.

## Key Risks

1. **Unauthorized-practice-of-law / advice line.** State-aware content or worksheet framing that crosses from information into legal or financial advice ("you should keep the house," "this is separate property") creates UPL and liability exposure. Mitigation: hard copy rules — checklists describe *tasks*, state content cites official sources and states facts, worksheets are labeled arithmetic with the attorney/CDFA footer on every output; a copy checklist review of every template and education card; "informational only, not legal or financial advice" disclosure at onboarding and in Settings.
2. **Admissibility overclaim.** Marketing "court-admissible evidence" invites legal challenge and user harm when a court excludes an export. Mitigation: never use "admissible"; the claim is "court-ready formatting" and "tamper-evident method, explained in plain language inside the export"; the PDF footer describes exactly what the hash chain does and does not prove; positioning is "organized for your attorney," and admissibility is explicitly their call.
3. **Safety: the spouse finds the app.** For some users, discovery of documentation mid-separation carries real risk. Mitigation: mandatory app lock before first data entry, auto-lock on background, no notifications that reveal content on the lock screen (generic copy only), no account email trail, and a Settings safety note linking to national hotline resources; evaluate a discreet app name/icon option in Phase 3 with domestic-violence-advocacy input.
4. **Data loss on a single device.** Sensitive documents on one phone, no cloud. Mitigation: encrypted backup export prompted after vault milestones and monthly; restore-from-file in Phase 2; the backup file is user-controlled (her own drive, a trusted person) so the no-cloud promise holds.
5. **Episodic churn — the event ends.** A divorce concludes; subscribers lapse. Mitigation: priced for it (event-monthly economics assume 12–24 months, which the data supports); the post-decree rebuild plan extends the arc 6–12 months; annual plan captures the realistic duration up front; the 45–65 life-event brand sequence (caregiving, widowhood) is the long-term retention answer, not fighting the event's natural end.
6. **RevenueCat/paywall dependency.** All revenue through one SDK. Mitigation: entitlements cached locally so an outage degrades to "paid stays unlocked"; pricing experiments via offerings, not app updates.
