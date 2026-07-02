# Briefcast

**AI meeting notetaker that writes back to your CRM.** A bot joins your Zoom, Google Meet, and Microsoft Teams calls (via Recall.ai), transcribes them, extracts decisions and action items, and syncs summaries, next steps, and structured field updates to HubSpot, Salesforce, or Pipedrive -- plus a digest to Slack.

## The Problem

Sales reps and agency account managers lose 3-5 hours a week to meeting admin:

- **Notes are a tax.** Reps either take notes during the call (and stop selling) or after the call (and forget half of it). Either way, notes live in a doc nobody opens again.
- **CRM hygiene is terrible.** Managers beg for updated deal stages, next steps, and close dates. Reps update the CRM at end of quarter, under duress, from memory. Pipeline reviews run on stale data.
- **Managers lack deal visibility.** The only record of what a prospect actually said is inside one rep's head. Deal reviews devolve into "what did they say about budget?" -- and nobody knows.
- **Existing notetakers stop at the notes doc.** Fireflies/Otter-style tools give you a transcript and a summary in *their* app. The CRM stays empty. The core workflow problem -- getting meeting intelligence into the system of record -- is unsolved for most teams.

## Target User

- **Primary:** B2B sales teams of 5-50 reps running discovery/demo calls on Zoom or Meet, living in HubSpot or Pipedrive. Buyer is the sales manager or RevOps lead; the pain is pipeline visibility and CRM hygiene, not note-taking per se.
- **Secondary:** Agencies (marketing, dev, consulting) running client calls, where account managers must log commitments and next steps against client records.
- **Not targeting (yet):** Enterprise revenue-intelligence buyers (Gong's turf), consumers, internal-meeting-heavy orgs (that's Otter/Fathom's commodity zone).

## Market & Profitability

Honest read of the category:

- **Meeting AI is a proven, paying category.** Fireflies, Otter, Fathom, and Grain have collectively millions of users; teams demonstrably pay $10-40/user/mo for this. There is no market-existence risk.
- **It is also crowded and commoditizing.** Generic "record + transcribe + summarize" is now table stakes; Fathom gives it away free and Zoom/Google/Microsoft bundle native AI summaries. Competing on notes quality alone is a losing game.
- **The wedge is CRM write-back.** The defensible position is being the tool that keeps the CRM accurate: field-level updates, per-deal intelligence, and RevOps-grade sync logs. That's a workflow/system-of-record play, not a transcription play, and incumbents treat it as a checkbox feature rather than the product.
- **Realistic outcome:** $10k-$100k MRR is achievable for a focused niche player here; this is a strong indie/small-team SaaS outcome, not a venture rocket unless we later expand into revenue intelligence. At $39 average revenue per seat, $50k MRR is roughly 1,300 paid seats -- e.g. 100-150 team accounts. Plausible via marketplace distribution; not trivial.
- **Margin structure:** COGS is real (recording + transcription + LLM per meeting-hour, see ARCHITECTURE.md) but sits around 10-20% of revenue at our prices for typical usage. Heavy users compress margin; per-seat fair-use limits matter.

## Monetization & Pricing

Per-seat, monthly, self-serve. Annual at ~2 months free.

| | Starter -- $19/user/mo | Pro -- $39/user/mo | Business -- $49/user/mo |
|---|---|---|---|
| Bot joins Zoom/Meet/Teams | Yes | Yes | Yes |
| Transcription + AI summary | Yes | Yes | Yes |
| Action items + decisions extraction | Yes | Yes | Yes |
| Slack delivery | Yes | Yes | Yes |
| Recording hours / user / mo | 20 | 40 | Unlimited (fair use) |
| CRM sync (HubSpot/Salesforce/Pipedrive) | -- | Yes | Yes |
| Field-level CRM write-back (stage, next step, close date) | -- | Yes | Yes |
| Per-deal intelligence timeline | -- | Yes | Yes |
| Custom extraction prompts / playbooks | -- | -- | Yes |
| Manager digest + team analytics | -- | -- | Yes |
| SSO/SAML, audit log, retention controls | -- | -- | Yes |
| Support | Email | Priority email | Priority + onboarding |

Pricing logic: Starter competes with Fireflies/Otter paid tiers for teams that just want notes in Slack. The CRM write-back gate at Pro is the actual product; we expect >70% of revenue on Pro/Business. Business exists for the 20+ seat deals where IT asks about SSO and retention.

## MVP Feature List

- [ ] Google/Microsoft calendar connect; auto-detect meetings with video links
- [ ] Recall.ai bot auto-joins scheduled calls (per-user join rules: all external / all / opt-in per meeting)
- [ ] Post-call transcription (Deepgram primary, Whisper fallback) with speaker diarization
- [ ] Claude-powered extraction: summary, decisions, action items (owner + due date), risks, next meeting
- [ ] Slack integration: per-user DM and/or channel post with summary + action items
- [ ] Meeting library UI: list, detail view with transcript, summary, action items
- [ ] HubSpot OAuth + write-back: log meeting to contact/company/deal, update next-step and deal-stage fields, sync log with per-field status
- [ ] Per-deal timeline: all meetings, commitments, and extracted signals attached to a deal
- [ ] Stripe per-seat billing with 14-day trial; seat count synced to active users
- [ ] Org/team model: workspace, invites, roles (admin/member)
- [ ] Recording-consent basics: bot announces itself, per-org consent settings, opt-out list

Post-MVP (fast follows): Pipedrive, Salesforce, custom playbooks, manager digest, API/Zapier.

## Differentiation

Not "better notes." The claim is: **your CRM stays accurate without reps typing.**

1. **Deep CRM write-back, field-level.** Not just "attach a notes doc to the contact." Briefcast proposes concrete field updates -- deal stage, next step, close date, budget/authority signals -- mapped to the org's actual CRM properties, with a review-or-auto-apply setting and a per-field sync log RevOps can audit.
2. **Per-deal intelligence timeline.** Every meeting is linked to a deal. The deal view shows the running history of commitments, objections, stakeholders, and slippage across all calls -- answerable questions like "when did pricing last come up on this deal?"
3. **Extraction tuned for sales, not meetings-in-general.** Prompts are built around MEDDICC-ish signals and agency account management, not generic "key points."
4. **Sync you can trust.** Idempotent writes, dry-run preview, per-field status, retry with backoff, and a visible log. This is the boring reliability work incumbents' checkbox integrations skip, and it's what makes RevOps champion the product.

What we deliberately do NOT differentiate on: real-time coaching, conversation analytics dashboards, call scoring (Gong's game, requires enterprise sales motion).

## Go-to-Market Channels

Ordered by expected yield:

1. **HubSpot App Marketplace.** Highest-intent channel: people searching "meeting notes" / "call transcription" inside HubSpot already have the exact pain. Requires certified app + reviews flywheel. This is the #1 priority after launch.
2. **Pipedrive Marketplace.** Smaller but far less crowded than HubSpot's; Pipedrive's SMB sales-team base is precisely our ICP and underserved by notetakers.
3. **Slack App Directory.** Discovery channel for the Slack-digest use case; converts teams whose entry point is "meeting summaries in Slack" and upsells CRM sync.
4. **Sales-community content.** Practical, non-promotional posts in RevGenius, Sales Hacker, r/sales, and RevOps communities: CRM hygiene playbooks, "we analyzed 1,000 discovery calls" content, templates. Long game, compounding.
5. **LinkedIn founder-led content.** 2-3 posts/week on pipeline hygiene, meeting-to-CRM workflows, build-in-public metrics. Cheap, targets the exact buyer (sales leaders live on LinkedIn).
6. **Agency partnerships.** HubSpot/Pipedrive solution partners implement CRMs for SMBs and get asked "how do we keep this updated?" -- Briefcast is their answer. Offer 20-25% recurring rev share. Doubles as the wedge into the agency ICP itself.

Paid acquisition is deferred: CAC on "meeting notetaker" keywords is bid up by well-funded incumbents.

## Competition

| Competitor | Pricing (approx) | Strength | Weakness vs Briefcast |
|---|---|---|---|
| Fireflies | Free; Pro $10-18/user/mo; Business $19-29 | Huge integration list, cheap, brand | CRM "integration" is mostly activity/notes logging, not field-level write-back; generic summaries; breadth over depth |
| Otter | Free; Pro ~$8-17/user/mo; Business ~$20-30 | Consumer brand, strong live transcription | Meetings-in-general product; weak sales workflow, shallow CRM story; enterprise pivot leaves SMB sales teams behind |
| Fathom | Free for individuals; Team ~$19-29/user/mo | Excellent free product, loved UX | Free tier anchors it as a notes tool; CRM sync is summary-paste, not per-deal intelligence; less RevOps control |
| Grain | Free; paid ~$15-19/user/mo (Business higher) | Sales-oriented, HubSpot-friendly, clips | Closest competitor; still summary-first -- lighter on field-level updates, sync auditability, and deal timeline depth |
| Gong | ~$100-250/user/mo + platform fee (sales-quoted) | Category king in revenue intelligence | 5-10x our price, sales-led, heavy deployment; SMB/mid-market teams and agencies can't buy it -- we're the affordable 80% |

Positioning sentence: "Fathom-simple capture, Gong-grade deal intelligence into your CRM, at SMB prices."

## Key Risks

1. **Platform/ToS risk on bots.** Zoom, Google, and Microsoft control bot access and periodically tighten rules (consent UX, app review, API changes); Zoom's own AI Companion competes with third-party bots. Mitigation: stay strictly compliant via Recall.ai (whose business is tracking this), keep a no-bot fallback (recording upload, calendar-note mode), and watch native-API recording access.
2. **Recall.ai dependency and cost.** Single vendor for the hardest infrastructure; ~$0.70-1.00/hr recorded is our largest COGS line, and their pricing/terms can change. Mitigation: abstract the bot layer behind an interface, monitor alternatives (self-hosted bots, Meeting BaaS), enforce per-plan hour limits.
3. **Incumbents adding real CRM sync.** Fireflies/Fathom/Grain could deepen write-back and compress our wedge. Mitigation: speed, depth (sync logs, field mapping, playbooks) that requires sustained focus, and marketplace review moat; be the best-reviewed CRM-sync notetaker on HubSpot/Pipedrive marketplaces before they wake up.
4. **Privacy and recording-consent law.** Two-party consent states (California, etc.), GDPR, and EU AI-transparency expectations make silent recording a liability. Mitigation: consent-first defaults (bot announces itself, visible participant, pre-meeting notice emails), org-level retention controls, data residency roadmap, delete-on-request; treat compliance as a selling point to managers, not friction.
5. **LLM extraction quality risk.** Wrong action items or bad field updates erode trust fast, and auto-writing wrong data to a CRM is worse than writing nothing. Mitigation: review-before-apply default, confidence thresholds, per-field provenance (link to transcript span), easy undo.

## Repo Contents

This is a product scaffold: documentation plus stub source files. Nothing here runs yet.

- `README.md` -- this file
- `ARCHITECTURE.md` -- stack, system diagram, data model, key flows, cost model
- `ROADMAP.md` -- phased plan with acceptance criteria
- `package.json`, `.env.example`, `.gitignore` -- project skeleton
- `src/` -- stub modules mirroring the intended structure
