# PaidWell

**Accounts-receivable autopilot for agencies and service firms: polite, escalating invoice follow-up in your firm's voice, a client payment portal, and a cash-flow forecast you can actually trust.**

---

## The Problem

Service firms do the work, send the invoice, and then wait. Net-30 becomes net-60 becomes "circling back on this." Nobody at a 6-person agency owns collections, so follow-up happens when the founder remembers, in an apologetic email written from scratch at 11pm. The result is a working-capital gap the firm finances out of its own pocket — while feeling too awkward to ask for money it has already earned.

The numbers say this is the norm, not the exception:

- 56% of US small businesses report being owed money on unpaid invoices, averaging roughly **$17.5k per business**, and late payments cost small firms an average of ~$39k/year ([QuickBooks 2025 Small Business Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/), [Clockify late-invoice statistics](https://clockify.me/late-invoice-statistics)).
- Net-30 is the stated term for ~60% of B2B companies, but actual payment terms in North America average ~43 days from invoicing — and real DSO runs well past that: 47% of businesses carry invoices 30+ days overdue ([The Kaplan Group, B2B payment-delay statistics](https://www.kaplancollectionagency.com/business-advice/54-statistics-on-the-b2b-payment-delays/)).
- The accounts-receivable automation category was ~**$4.8B in 2025**, growing at a ~13% CAGR ([Grand View Research](https://www.grandviewresearch.com/industry-analysis/accounts-receivable-automation-market-report)) — but the tooling is built for AR departments at mid-market and enterprise, not for a 12-person studio with 30 open invoices and no finance hire.

The fix is boring and known: consistent, polite, escalating follow-up; a frictionless way to pay; and visibility into what's actually going to land this month. Firms just never build it, because chasing money feels bad and there's always client work due.

## Target User

- **Primary:** owners and ops leads at agencies, consultancies, and professional-service firms (design, dev, marketing, accounting, engineering) with 2–50 people, invoicing $30k–$500k/month on net-15/30/45 terms out of QuickBooks, Xero, or Stripe Invoicing.
- **Secondary:** fractional CFOs and bookkeepers who run AR for several client firms and want one console.
- **Buyer profile:** the founder who knows exactly which three clients are 47 days out but hasn't sent the third nudge because the second one already felt rude.
- **Not a target:** subscription/card-on-file businesses (failed-payment dunning is a different product — see Differentiation), enterprises with AR teams and ERPs, consumer invoicing.

## Market & Profitability

- The pain is universal in services, quantified in the firm's own aging report, and recurs every month. The product's value is provable in dollars-landed-sooner, which is the best possible retention argument.
- Realistic outcome: **$15k–$80k MRR** over 2–3 years. At a $130 blended ARPU that's 115–600 firms — reachable through accountant/bookkeeper channels and agency communities without paid spend.
- Costs are near-nil relative to price (email, a queue, accounting-API polling); gross margins 85–90%.
- Churn logic favors us: the dashboard shows "collected $84k, 22 days faster" next to a $149 invoice. Cancelling means going back to chasing manually — nobody wants that job back.

## Monetization & Pricing

| Plan | Price | Limits & features |
|---|---|---|
| **Studio** | $79/mo | 1 firm, up to 50 open invoices, email sequences in your voice, payment portal, aging dashboard |
| **Firm** | $149/mo | Up to 250 open invoices, promise-to-pay tracking, cash-flow forecast, client risk profiles, 2 team seats |
| **Practice** | $249/mo | Unlimited invoices, 3 managed firms (fractional CFO/bookkeeper mode), escalation approvals, API, 5 seats |

14-day trial that starts with a read-only sync: we show the firm its own aging picture and the follow-ups we *would* send before anything goes out. No per-invoice or percentage fees — we never take a cut of the firm's money.

## MVP Feature List

- [ ] Accounting sync: QuickBooks Online + Xero OAuth (read invoices, contacts, payments; write payment records), plus CSV/Stripe-Invoicing import
- [ ] Follow-up sequences: escalating email steps (gentle → firm → final) on the firm's own domain, in the firm's voice — tone presets + per-step editable templates with merge fields
- [ ] Approval mode: sequences run on autopilot or queue each send for one-tap approval
- [ ] Client payment portal: signed-link, no-login page per invoice/client showing balance, PDF invoices, and pay-now (card + ACH via Stripe), with partial payments
- [ ] Promise-to-pay tracking: log a promise ("paying Friday"), auto-pause the sequence, auto-resume with a firmer step if the date passes unpaid
- [ ] Aging dashboard: 0-30/31-60/61-90/90+ buckets, DSO trend, per-client payment behavior (average days-to-pay, reliability)
- [ ] Cash-flow forecast: expected receipts by week from due dates, promises, and each client's historical days-to-pay
- [ ] Escalation ladder config: per-client term overrides, VIP exclusions, stop-on-reply detection, late-fee line mention (configurable, off by default)
- [ ] Billing for PaidWell itself (Stripe, the three plans above)

Post-MVP (explicitly cut from v1): SMS steps, physical-letter escalation, collections-agency handoff, multi-currency, direct ERP integrations, client statements consolidating multiple invoices.

## Differentiation

1. **Voice-first follow-up.** Competitors send obvious robo-dunning ("Dear valued customer, invoice #4482 is overdue"). PaidWell's sequences read like the firm's best account manager wrote them — tone presets tuned for agencies that must keep the relationship warm while getting paid.
2. **Not card dunning.** This portfolio already contains Dunly (apps/02) for failed-payment recovery on Stripe subscriptions. PaidWell is the opposite world: invoice-based B2B services where the money is owed on terms, the payer is a human at a client company, and the problem is silence, not a declined card. Different data spine (invoices and promises, not webhooks and retries), different buyer, zero overlap.
3. **Promise-to-pay as a first-class object.** "Sending it Friday" is where most AR conversations end and most cash-flow surprises begin. Tracking, pausing, and firmly resuming on broken promises is the feature firms actually need and generic reminder tools skip.
4. **Forecast, not just nagging.** The weekly cash-in forecast built from real client behavior turns PaidWell from a reminder tool into the firm's Monday-morning money screen.
5. **Priced for firms without an AR department.** Bill.com, Melio, and enterprise AR suites assume an AP/AR workflow team. PaidWell assumes the owner does this between client calls.

## Go-to-Market

1. **Bookkeeper and fractional-CFO channel.** They run AR for dozens of firms and bill hourly for chasing; PaidWell makes them look good. Practice tier + 20% recurring referral. QuickBooks ProAdvisor and Xero advisor directories are the hunting ground.
2. **QuickBooks and Xero app marketplaces.** High-intent search ("invoice reminders," "get paid faster") inside the tools the ICP already lives in. Start listing review early — both are slow.
3. **Agency communities and newsletters.** The awkwardness angle writes itself ("How to ask for your money without sounding like a collections agency") for agency Slack groups, Bureau of Digital, and freelance/studio newsletters.
4. **The free "aging audit."** Connect read-only, get a one-page report: your real DSO, your slowest payers, the dollars you'd have today at 30 days flat. The report is the trial.
5. **SEO on the pain.** "client hasn't paid invoice," "polite payment reminder email," "net 30 follow up template" — huge template-hunting traffic; the templates are literally the product's output.

## Competition

| Competitor | Price | Weakness we exploit |
|---|---|---|
| Manual (email + spreadsheet) | Free | Inconsistent, awkward, no forecast; dies when the founder is busy — which is always |
| QuickBooks/Xero built-in reminders | Included | Robotic single-template nags; no escalation, promises, portal behavior data, or forecast |
| Chaser | ~$40–$350/mo | Built around AR-clerk workflows; UK-centric; templates feel like a finance department, not a studio |
| Upflow | ~$440+/mo entry | Priced and designed for mid-market finance teams, not 10-person firms |
| Bill.com / Melio | ~$45+/user/mo | AP-first suites; receivables follow-up is an afterthought; heavy setup |
| Kolleno / Invoiced | Mid-market+ | Sales-led, ERP-oriented; overkill below $1M/month invoiced |

## Key Risks

1. **Accounting-API dependency.** QuickBooks/Xero OAuth policy or rate-limit changes can break sync. Mitigation: strict API version pinning, webhook + polling redundancy, CSV import as a permanent fallback.
2. **Deliverability is the product.** If follow-ups land in spam, we're worthless. Mitigation: send from the firm's own domain (SPF/DKIM setup flow), per-firm sending isolation, stop-on-reply, suppression lists, and volume caps.
3. **Tone failure hurts the customer's brand.** One overly aggressive email to a key client is churn. Mitigation: approval mode as the default for new firms, conservative default ladder, per-client VIP exclusions, and full send previews.
4. **Incumbent bundling.** Intuit could make built-in reminders good. Accept: they've had a decade; robo-nags remain robotic. Our moat is voice, promises, and forecast — product surface Intuit won't polish for 10-person agencies.
5. **Category education.** Firms tolerate late payment as weather. The aging-audit wedge reframes it as a number with a fix; without that reframe, top-of-funnel stalls.
