# CallCatch Roadmap

## Phase 0 — Setup (week 0)
- Twilio dev number provisioned; status callbacks + SMS round trip working
- A2P 10DLC registration started (takes weeks — start immediately)

**Done when:** a missed call to the dev number triggers an automated SMS.

## Phase 1 — MVP: text-back tier (weeks 1–4)
- Missed-call detection (provisioned + forward-on-no-answer paths)
- AI SMS qualification loop with vertical packs (plumbing, HVAC, salon to start)
- Lead records + owner notifications; basic dashboard
- Onboarding wizard; Stripe billing ($99 tier + setup fee)

**Done when:** 5 pilot businesses run live for 2 weeks; ≥50% of texted-back callers engage; owners confirm lead quality.

## Phase 2 — Voice tier (weeks 5–10)
- Media Streams voice loop (STT→Claude→TTS) with the safety state machine
- FAQ answering from business profile; message-taking fallback; human transfer
- Calendar booking (Google Calendar, then Cal.com)
- Call recordings/transcripts UI + consent disclosures per state
- $199/$299 tiers; revenue-recovered dashboard

**Done when:** AI handles ≥80% of pilot calls without fallback-to-message on FAQ/booking intents; zero improvised-pricing incidents in transcript review.

## Phase 3 — Growth (months 3–8)
- Agency white-label portal (multi-account, margin billing, branded dashboard)
- Per-vertical landing pages + demo call recordings; Jobber/Housecall Pro integrations
- Outbound follow-up sequences (quote follow-ups, review requests) as upsell
- Annual prepay; multi-location support

**Done when:** $15k MRR; ≥40% of new revenue via agencies; logo churn <3%/mo.
