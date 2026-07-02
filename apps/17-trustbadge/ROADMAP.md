# TrustBadge Roadmap

## Phase 0 — Setup (week 0)
- Next.js app + Postgres schema migrated; widget bundle builds to <15KB gzipped
- Shopify partner app created (dev store install works)

**Done when:** dev store installs the app and the script tag renders a hello-world badge.

## Phase 1 — MVP (weeks 1–5)
- Shopify OAuth + orders webhook → review-request queue
- Email review requests (Resend) with delay rules; hosted review form (text + photos)
- Widgets: star badge + reviews wall (Shadow DOM, themable)
- Moderation dashboard (approve/reply/hide)
- CSV import; free tier (50 orders/mo) + Stripe plans

**Done when:** a pilot store collects 20 real reviews and displays them with zero layout shift and <30ms widget paint.

## Phase 2 — Launch (weeks 6–9)
- Shopify App Store listing (review + GDPR webhooks compliance pass)
- Carousel + floating-proof widgets; schema.org rich-snippet JSON-LD
- Photo-review incentives (auto coupon on approved photo review)
- Google/Etsy/Amazon review imports

**Done when:** listed publicly; 25 installs; ≥30% of review requests convert on pilot stores.

## Phase 3 — Growth (months 3–6)
- SMS requests (Twilio) + A/B testing on request timing
- Video reviews (Pro tier); AI reply suggestions for merchants
- WooCommerce plugin + generic script-tag onboarding for any cart
- Widget performance marketing: public speed benchmark vs Loox/Judge.me/Yotpo

**Done when:** $5k MRR; <2% monthly logo churn; widget p95 paint <30ms at 1k stores.
