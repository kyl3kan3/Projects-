# SubSage

**SubSage is a privacy-first subscription tracker that finds your recurring charges in email receipts -- never your bank account -- and warns you before renewals and price hikes hit.**

---

## The Problem

The average US consumer now carries 12+ recurring subscriptions and underestimates their monthly subscription spend by roughly 2-3x. Four specific failures drive this:

1. **Subscription creep.** Services are trivially easy to start and deliberately hard to inventory. Charges are spread across cards, app stores, and PayPal, so there is no single place to see "everything I pay for monthly."
2. **Forgotten trials.** Free trials convert silently. The reminder email (if any) arrives hours before the charge, buried in a promotions tab.
3. **Price hikes buried in email.** Streaming and SaaS vendors raise prices with a single easily-missed email. Most users discover a hike months later, if ever. Nobody diffs their own receipts.
4. **Distrust of bank-linking apps.** The dominant solution (Rocket Money, and formerly Truebill/Mint) requires handing over bank credentials via Plaid. A large segment of consumers -- burned by the Mint shutdown and wary of data brokers -- simply refuses. They currently solve this with a spreadsheet, badly.

SubSage attacks all four without ever touching a bank account: it reads receipt emails through Gmail's read-only API, parses them into a local on-device database, and layers reminders, price-diff detection, and cancellation guides on top.

## Target User

**The subscription-fatigued, privacy-conscious consumer.** Age 25-45, has 8-20 active subscriptions, has been surprised by at least one unwanted renewal in the past year, and has looked at Rocket Money but bounced off the bank-login screen. They keep (or intend to keep) a subscription spreadsheet. They will happily grant read-only email access to a tool that promises data stays on their phone, but will never type their bank password into a startup's app.

Secondary: manual-tracker users (ex-Bobby users, since Bobby is effectively abandoned) who want reminders and price tracking without any account linking at all.

## Market & Profitability

- **Category economics are unusually good.** Subscription trackers sit in the Utilities app category, which posts the highest LTV of any category in RevenueCat's benchmark data: roughly **$68.90 per trial-starting user over 12 months**. The **weekly-plan-plus-trial configuration is the highest-LTV paywall setup** in that data -- which is exactly the offer SubSage leads with.
- **Willingness to pay is proven.** Rocket Money charges $6-12/month and has millions of paying users. Bobby's abandonment left a visible hole for manual/private tracking.
- **The app pays for itself in the first session.** Cancelling one forgotten $9.99/month subscription covers 6+ months of SubSage annual pricing. This "found money" framing is the core conversion lever.
- **Realistic revenue target: $10k-$100k MRR.** At the category's ~$68.90 LTV per trial user, $10k MRR requires only a few hundred trial starts per month sustained; $100k MRR is achievable with strong ASO plus paid acquisition on competitor terms, without needing top-chart placement. This is a solid solo-dev / small-team business, not a venture-scale one, and it is priced and scoped accordingly.
- **Costs are near zero.** All user data lives on device; the only server is a tiny stateless OAuth/parsing API. Infrastructure at 1,000 customers is under $100/month (see ARCHITECTURE.md), so gross margin is effectively store-commission-bound (70-85%).

## Monetization & Pricing

Primary offer is the weekly plan with a 3-day trial (the highest-LTV paywall configuration in category benchmarks), with annual as the committed-user fallback. Managed via RevenueCat.

| Tier | Price | Trial | Includes |
|------|-------|-------|----------|
| Free | $0 | -- | Track up to 5 subscriptions (manual add only), renewal reminders for those 5, basic monthly total |
| Premium Weekly | $4.99 / week | 3-day free trial | Everything: unlimited subscriptions, Gmail receipt scanning, price-hike detection, cancel-assist guides, full insights (annual totals, category breakdown), unlimited reminders |
| Premium Annual | $34.99 / year | -- | Same as weekly; positioned as the "save 87%" fallback for users who balk at weekly pricing |

Paywall mechanics:

- Free tier is a real, usable product (5 manual subscriptions with reminders) so the app earns trust before asking for money.
- The paywall triggers at high-intent moments: adding a 6th subscription, tapping "Connect Gmail," or opening price-hike history.
- Weekly-with-trial is presented first; annual is the visible fallback on the same screen. RevenueCat offerings make the mix remotely tunable and A/B-testable without app updates.

## MVP Feature List

- [ ] Manual subscription add/edit (name, amount, billing cycle, next renewal date, category, payment method label)
- [ ] Subscription list with monthly-equivalent cost and next-renewal sort
- [ ] Local SQLite persistence (expo-sqlite); zero server-side user data
- [ ] Renewal reminders via local push notifications (default: 3 days + 1 day before renewal, configurable)
- [ ] Trial-ending reminders (flag a subscription as trial; alert before conversion)
- [ ] Gmail connect flow (OAuth, gmail.readonly scope only) via companion API token exchange
- [ ] Receipt scan: query Gmail for receipt-like messages, parse merchant/amount/date, propose subscriptions for one-tap confirmation
- [ ] Re-scan on demand plus background refresh of recent receipts
- [ ] Price-hike detection: diff successive receipt amounts per merchant, alert on increase, show price history
- [ ] Cancel-assist guides: per-service cancellation steps with deep links (bundled JSON for top 50 services, remotely updatable cache)
- [ ] Spending insights: monthly and annual totals, category breakdown, month-over-month delta
- [ ] Paywall screen with RevenueCat offerings ($4.99/week + 3-day trial primary, $34.99/year fallback)
- [ ] Free-tier gate: 5 subscriptions, manual only; premium gates on Gmail scan, hike detection, cancel guides, full insights
- [ ] Restore purchases + subscription management entry point
- [ ] Onboarding flow that lands on the paywall after demonstrating value (add first subscription, show projected annual spend)
- [ ] Settings: notification timing, currency, data export (CSV), delete-all-data
- [ ] Basic analytics (privacy-respecting: events only, no receipt content) and crash reporting

## Differentiation

1. **No bank login. Ever.** No Plaid, no credentials, no transaction feed. This is the headline. It is the exact objection that stops privacy-conscious users from adopting Rocket Money, and it is structural -- Rocket Money cannot remove bank linking without destroying its business model (negotiation/concierge revenue).
2. **On-device data.** Receipts are parsed and stored in SQLite on the phone. The companion API is a stateless pass-through for OAuth token exchange and parsing; it stores no receipt content and no message bodies at rest. "Your data never lives on our servers" is verifiable in the architecture, not a marketing claim.
3. **Price-hike detection.** Diffing a user's own receipt history per merchant is something neither Bobby (manual-only, no email data) nor most bank-linked apps (amounts change but no receipt context) surface well. "Netflix raised your price by $2.50 in March" is a screenshot-worthy moment.
4. **Cancel-assist that respects the user.** Guides and deep links that help users cancel themselves -- not a paid concierge upsell like Rocket Money's, which takes a cut of "savings."

## Go-to-Market

- **ASO first.** Primary keywords: "subscription tracker", "cancel subscriptions", "subscription manager", "bill reminder", "track free trials". Title/subtitle target: "SubSage: Subscription Tracker" / "Cancel unwanted bills privately". Localize keyword sets for UK/CA/AU early (same-language, cheap wins).
- **Apple Search Ads on competitor brand terms.** Bid on "rocket money", "truebill", "bobby app", "trackmysubs". Landing angle: "The subscription tracker that never asks for your bank login." Competitor-term CPTs in finance/utilities are viable given ~$68.90 LTV per trial user.
- **TikTok / Reels money-saving creators.** Partner with personal-finance and "money hacks" creators for demo-format content: "I found $73/month in subscriptions I forgot about -- without giving an app my bank password." The scan-and-reveal moment is inherently filmable. Start with flat-fee micro-creators (10k-100k followers), scale what converts via promo codes.
- **Reddit: r/personalfinance and r/Frugal.** Not ads -- genuine participation in the recurring "how do I track subscriptions" and "Mint alternative" threads, where "I refuse to link my bank" is a constant refrain. Also r/privacy and r/degoogle for the on-device-data angle.
- **Product Hunt launch** at v1.1 (after App Store stability), leading with the privacy architecture. PH's audience is exactly the Plaid-averse early adopter.
- **Content SEO (slow burn).** "How to cancel X" pages generated from the cancel-guide dataset -- one indexable page per service -- funneling to the app.

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|------------|---------|-----------|------------|
| Rocket Money | Free tier; Premium $6-12/mo (pay-what-you-pick); takes 30-60% of first-year savings on negotiated bills | Brand scale, automatic detection via bank feed, bill negotiation concierge, polished app | **Requires bank linking via Plaid** -- hard blocker for privacy-conscious users; aggressive upsells; savings-cut pricing feels predatory; overkill for "just track my subscriptions" |
| Bobby | Free up to ~5 subscriptions; ~$3 one-time unlock (legacy) | Beloved simple UI, fully manual so fully private, one-time pricing | **Effectively abandoned** (years without meaningful updates); manual-only -- no email scan, no price-hike detection; iOS-centric; no reminders beyond basic; no web/Android parity |
| TrackMySubs | Free up to 10 subs; paid plans ~$5-10/mo | Web-based, good for freelancers/businesses tracking SaaS, multi-currency | Web-first with weak/no mobile presence; dated UX; manual entry only; no push notifications on mobile; positioned for business expense tracking, not consumers |

SubSage's wedge: Bobby's privacy and simplicity, plus the automation (email scan, hike detection) that previously required surrendering bank credentials.

## Key Risks

1. **Gmail API OAuth verification and CASA assessment.** The `gmail.readonly` scope is a "restricted" scope: Google requires app verification plus an annual CASA (Cloud Application Security Assessment) Tier 2 review. Budget roughly $500-$5,000+ per year (assessor-dependent) and 4-8+ weeks of calendar time; unverified apps are capped at 100 test users. Mitigation: ship manual tracking first (Phase 1 revenue does not depend on Gmail), start verification paperwork in Phase 0, and keep the requested scope surface minimal (single read-only scope, thin stateless server) to simplify review.
2. **Apple review of finance-adjacent apps.** Apps touching money and subscriptions get extra scrutiny (guidelines 3.1 on paywalls, 5.1 on data collection). A weekly $4.99 price point invites "subscription value" review questions. Mitigation: transparent paywall copy, functional free tier, clear privacy nutrition labels (data-not-collected is a genuine advantage here), and a compliant account/data-deletion path.
3. **Parsing accuracy across merchants.** Receipt formats are unstandardized and change without notice; a parser that mislabels amounts erodes trust instantly. Mitigation: launch with hand-tuned parsers for the top ~50 merchants (covering the large majority of consumer subscriptions), always show parsed results for user confirmation rather than silently inserting, and instrument parse-failure rates (counts only, never content) to prioritize fixes.
4. **RevenueCat / paywall dependency.** All revenue flows through one third party's SDK and backend. Mitigation: RevenueCat's failure modes are well-documented and its pricing (free to $2.5k MTR, then ~1%) is sustainable; keep entitlement checks cached locally so a RevenueCat outage degrades to "premium stays unlocked," not "app breaks."
5. **Churn on weekly plans.** Weekly-plus-trial maximizes LTV partly through fast churn cycles; it also risks refund requests and review-score damage from users who forget the trial. Mitigation: send our own trial-ending notification (an on-brand move for a subscription-reminder app -- we remind you about *our* subscription too), make cancellation friction-free via the cancel-assist guide for SubSage itself, and let RevenueCat experiments tune the weekly/annual mix if churn or refunds spike.
6. **Platform risk on email access.** Google could tighten restricted-scope policy or pricing. Mitigation: manual mode is a complete product without Gmail; IMAP or forward-to-parse are fallback ingestion paths if policy shifts.
