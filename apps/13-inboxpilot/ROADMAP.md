# InboxPilot Roadmap

## Phase 0 — Setup (week 0)
- MV3 extension skeleton loads unpacked; InboxSDK injects a button into Gmail compose
- Fastify API + Postgres running; Google OAuth sign-in works from the popup

**Done when:** clicking the injected button round-trips text to the API and back into the compose box.

## Phase 1 — MVP (weeks 1–4)
- Thread extraction (DOM-based, no Gmail API scopes)
- Draft generation streamed into compose; tone controls (shorter/friendlier/firmer/formal)
- Quota metering + Stripe Basic plan; 14-day trial (30 drafts)
- Snippet library with variables
- Injection-failure telemetry (canary alert if Gmail DOM changes)

**Done when:** 10 beta users draft daily for a week with <2% injection failures and a usable-draft rate they self-report >70%.

## Phase 2 — Launch (weeks 5–8)
- Chrome Web Store listing (screenshots, demo video, keyword pass)
- Pro tier: voice training via consented gmail.readonly OAuth (verification submitted early — it takes weeks)
- Follow-up reminders
- Launch: Product Hunt, short-form demo videos, sales/recruiting communities

**Done when:** listed publicly; 500 installs; ≥5% install→trial, ≥25% trial→paid.

## Phase 3 — Growth (months 3–6)
- Team plan (shared snippets, tone guide); affiliate program
- Scheduled-send suggestions + reply-priority inbox hints
- Firefox/Edge ports (same WebExtension core)
- Outlook add-in exploration (only if pull is proven)

**Done when:** $3k MRR; churn <6%/mo; store rating ≥4.5.
