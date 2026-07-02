# Dunly

**Failed-payment recovery and dunning for Stripe subscription businesses. Recovers 30-70% of involuntary churn, so it pays for itself.**

## The Problem

Roughly 20-40% of all SaaS churn is *involuntary*: the customer never decided to leave, their card just failed. Expired cards, insufficient funds, bank declines, 3DS friction. Stripe's default behavior (a few dumb retries, then cancel the subscription) throws that revenue away.

For a SaaS doing $50k MRR with 8% annual involuntary churn, that's roughly $48k/year silently leaking out of Stripe. Most founders don't see it because it never shows up as a cancellation survey response -- it shows up as `invoice.payment_failed` webhooks nobody is reading.

The fixes are well understood but tedious to build in-house:

1. **Smart retries** timed to when charges actually succeed (paydays, mornings local time, after bank holidays), not a fixed schedule.
2. **Pre-dunning**: email the customer *before* their card expires, so the failure never happens.
3. **Dunning sequences**: branded email + SMS sequences with a hosted card-update page, escalating over 14-28 days.
4. **Attribution**: knowing which recovered dollar came from which retry or message, so you can prove ROI.

Every subscription business past ~$20k MRR needs this. Almost none want to build it.

## Target User

- **Primary:** founders/operators of Stripe-based subscription SaaS between $20k and $500k MRR. Big enough that failed payments are real money ($500-$15k/mo leaking), small enough that they haven't built internal dunning or hired a RevOps person.
- **Secondary:** memberships, newsletters, and communities on Stripe Billing (Ghost, Circle, Memberful-adjacent DIY stacks).
- **Buyer profile:** technical founder or head of growth who already watches Baremetrics/ChartMogul and hates unexplained MRR dips. They will connect Stripe in 10 minutes if the ROI math is obvious.
- **Not a target (yet):** enterprises on Chargebee/Recurly/Zuora, usage-billing companies, or anyone not on Stripe.

## Market & Profitability

This is a small but unusually good niche, and it's worth being honest about both halves of that:

- **Category economics:** payment-recovery tools run 70-90% gross margins (it's webhooks, a queue, and email). More importantly, churn on the tool itself is near zero because the dashboard shows "we recovered $X this month" next to a $149 invoice. Cancelling is provably irrational as long as recovered revenue exceeds the fee.
- **Realistic ceiling:** this is not a venture-scale market. Established competitors (Churn Buster, Stunning) have operated for 8-10+ years as profitable small businesses. A realistic outcome is **$10k-$80k MRR** over 2-4 years: roughly 80-500 customers at a ~$120-160 blended ARPU. Getting there requires consistent distribution work, not just a good product.
- **Why there's still room:** Baremetrics Recover is bundled with an analytics suite most people don't want; Churn Buster has moved upmarket toward e-commerce/ReCharge; Stunning's product and marketing have aged. Nobody owns "the obvious default for a Stripe SaaS under $500k MRR," and nobody does SMS + pre-dunning + honest attribution well in one tool.
- **Expansion revenue is structural:** pricing is tiered by MRR under management, so customers upgrade as *they* grow, without a sales conversation.

Expect: slow first 6 months (this category sells on trust and proof), then compounding retention. Don't expect: virality or fast top-of-funnel.

## Monetization & Pricing

Tiered by MRR under management (what we meter from their Stripe account), with an alternative performance plan for the ROI-skeptical.

| Plan | Price | MRR under management | Includes |
|---|---|---|---|
| **Starter** | $49/mo | up to $25k | Smart retries, email dunning sequences, hosted card-update page, recovery dashboard |
| **Growth** | $149/mo | up to $100k | Everything in Starter + SMS dunning, pre-dunning card-expiry campaigns, custom sender domain, Slack alerts |
| **Scale** | $299/mo | up to $500k | Everything in Growth + multiple Stripe accounts, A/B tested sequences, API + webhooks out, priority support |
| **Performance** | 25% of recovered revenue | any | All features, no fixed fee. Capped at $2,000/mo. For teams who want zero-risk proof before switching to flat pricing |

Notes on the model:

- The **Performance plan is the wedge**, not the destination. It converts skeptics ("free unless it works"), and once recovered revenue is consistent, 25% is visibly more expensive than the flat tier -- customers self-migrate to flat plans, which is the retention moment.
- 14-day free trial on flat plans with a **"recovery preview"**: on connect, we scan the last 90 days of failed invoices and show the dollars we would likely have recovered. The trial sells itself or it doesn't.
- No free tier. Sub-$20k-MRR businesses don't have enough failure volume to see value, and they churn.

## MVP Feature List

- [ ] Stripe Connect onboarding (OAuth, read/write on invoices, customers, payment methods)
- [ ] Webhook ingestion with signature verification, idempotent processing, and replay
- [ ] Historical backfill: import last 90 days of invoices/failures for the recovery preview
- [ ] Smart retry engine: configurable schedule (default 4 retries over 14 days), timed by day-of-week/time-of-day heuristics; suppress retries when Stripe Smart Retries are active to avoid double-charging
- [ ] Email dunning sequences (Resend): 3-5 step default sequence, editable templates, merge tags, per-org sender domain
- [ ] Hosted card-update page (Stripe SetupIntent / Checkout in setup mode) -- no login required, signed token links
- [ ] Pre-dunning: detect `card.expiring` (cards expiring this month) and send update-your-card emails before the renewal
- [ ] Recovery attribution: every recovered invoice tied to the retry or message that preceded payment
- [ ] Dashboard: recovered $ this month, recovery rate, at-risk MRR, per-campaign performance
- [ ] Billing for Dunly itself (Stripe Billing, the four plans above)
- [ ] Email deliverability basics: per-org subdomain sending, SPF/DKIM setup flow, suppression list, unsubscribe handling

Post-MVP (explicitly cut from v1): SMS (Twilio) sequences, A/B testing, Slack alerts, multi-account, public API, in-app banners/paywall widget.

## Differentiation

1. **Honest attribution.** Competitors count every payment that eventually succeeded as "recovered," inflating ROI. Dunly separates "recovered by us" (payment followed a Dunly retry/message) from "would have recovered anyway" (baseline Stripe retry succeeded). Counter-intuitive, but it builds the trust that keeps a $299/mo line item unquestioned for years.
2. **Pre-dunning as a first-class feature.** Preventing the failure beats recovering it. Card-expiry campaigns are a checkbox in most competitors; here they're a headline feature with their own attribution.
3. **SMS in the base Growth tier.** SMS open rates crush email for "your card failed" messages. Stunning and Recover treat SMS as an afterthought or don't offer it.
4. **Built for Stripe only.** No Braintree/Recurly abstractions. We can use Stripe-specific features (Smart Retries awareness, SetupIntents, Checkout, Connect) deeply instead of least-common-denominator.
5. **Performance pricing option.** Nobody in the niche offers a pure rev-share plan with a cap. It removes the only real sales objection ("will it work for *my* customers?").

## Go-to-Market Channels

In priority order:

1. **Stripe App Marketplace.** Publish a Stripe App so Dunly appears when merchants search "dunning" / "failed payments" inside the Stripe Dashboard. Highest-intent channel that exists for this product; the review process is slow, so start it in Phase 2, not after launch.
2. **Content SEO on failure/recovery keywords.** "failed payment recovery," "stripe dunning," "involuntary churn," "stripe smart retries vs dunning," "card expired subscription." Low volume, extremely high intent, weak incumbent content. Ship 10-15 deep articles + a free **involuntary-churn calculator** (paste your Stripe stats, see your leak) as the lead magnet.
3. **Cold outreach to visible Baremetrics/ProfitWell/ChartMogul users.** These companies badge their customers (public dashboards, testimonial pages, "powered by" footers). Anyone paying for subscription analytics already feels the churn problem. Personalized outreach with a free failed-payment audit offer.
4. **Indie Hackers / r/SaaS / MicroConf Connect / small SaaS Slack-Discord communities.** Build-in-public revenue posts ("we recovered $31k for 40 companies this quarter") perform well in these spaces and this audience *is* the ICP. MicroConf especially: attendees are exactly $20k-$500k MRR operators.
5. **Integration/agency partnerships.** SaaS-focused Stripe consultancies and boutique dev shops implement billing for dozens of clients; a 20% recurring referral cut makes Dunly their default recommendation.
6. **Comparison pages.** "Dunly vs Churn Buster," "Baremetrics Recover alternative," "Stunning alternative." Incumbents have weak or no comparison content; these pages convert switchers who are already sold on the category.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Churn Buster** | ~$99+/mo entry, scales with volume; effectively $250+ for mid-size | Moved focus to e-commerce/ReCharge subscriptions; SaaS is no longer the core ICP. Pricing opaque at higher volumes. No real pre-dunning story. |
| **Baremetrics Recover** | Bundled with Baremetrics (~$129-$249+/mo total depending on MRR) | You must buy the whole analytics suite to get Recover. Attribution is generous (counts baseline recoveries). Baremetrics has changed owners twice; product velocity is low. |
| **Stunning** | ~$100-$400/mo by customer count | Oldest player; UI and email templates feel dated. Weak analytics/attribution. Little visible product development in recent years. |
| **Chargebee Receivables (ex-numberz)** | Enterprise pricing, sales-led | Aimed at invoicing/AR for larger businesses on Chargebee. Irrelevant to self-serve Stripe SaaS, but wins any deal that goes upmarket to a billing platform. |
| **Stripe native (Smart Retries + basic dunning emails)** | Free / included in Stripe Billing | The real competitor. Covers retries and bare-bones emails. No SMS, no pre-dunning campaigns, no sequences, generic unbranded emails, no attribution or recovery analytics. We must be clearly better than "good enough and free." |

## Key Risks

1. **Stripe builds it natively.** Stripe already ships Smart Retries and basic dunning emails and improves them steadily. Mitigation: live in the gaps Stripe won't prioritize (SMS, branded multi-step sequences, pre-dunning campaigns, cross-retry attribution, opinionated analytics), and treat the Stripe App Marketplace as distribution inside their walls rather than competing outside them. Accept this risk consciously: it caps the ceiling but doesn't kill the niche -- competitors have coexisted with Stripe's native tooling for 10 years.
2. **Platform dependency.** 100% of the product sits on Stripe's API and webhook contract. An API deprecation, Connect policy change, or marketplace rejection is existential. Mitigation: strict API version pinning, webhook replay tolerance, and keeping a Paddle/Chargebee expansion on the long-term roadmap as optionality (not a v1 distraction).
3. **Email/SMS deliverability.** Dunning emails are transactional but look promotional to filters; if our shared sending infra gets a bad reputation, every customer's recovery rate drops at once. Mitigation: per-customer sending subdomains from day one, mandatory SPF/DKIM verification, suppression lists, and rate limits. SMS adds 10DLC registration compliance in the US -- budget real time for it.
4. **Attribution disputes.** Our invoice is justified by "we recovered $X." If customers doubt the number, churn follows. Mitigation: the conservative attribution model above, with per-invoice drill-down showing exactly which retry/message preceded payment.
5. **Small-market gravity.** The honest ceiling (~$80k MRR realistic best case) means a few lost quarters of distribution effort matter. This is a focused-execution business, not a spray-and-pray one.
6. **Double-charge/compliance hazards.** A retry bug that double-charges an end customer, or SMS sent without consent (TCPA), damages the *customer's* brand, not just ours. Mitigation: idempotency keys everywhere, retry suppression when Stripe retries are active, per-recipient SMS opt-in state, and an audit log of every action taken on a customer's Stripe account.
