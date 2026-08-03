# LedgerLens

**Pre-accounting for solo operators: forward an invoice, photo a receipt, and hand your accountant a clean monthly close package they actually want. The shoebox killer.**

## The Problem

Every solo operator -- the plumber, the freelance designer, the Etsy seller, the one-truck landscaper -- runs the same broken pipeline: receipts pile up in a glovebox, invoices rot in an email folder, and every January the whole mess gets dumped on an accountant who charges a "cleanup fee" to reconstruct twelve months of history from crumpled thermal paper. The fee is real money ($300-$800 is typical for a year of shoebox bookkeeping), the reconstructed categories are guesses, and deductions get missed because the receipt faded or the email got deleted.

The operator does not want accounting software. QuickBooks Self-Employed and Wave exist and they still don't use them, because those tools ask for a bookkeeper's workflow: chart of accounts, reconciliation screens, double-entry concepts. What the operator actually does is *receive documents* -- a receipt at the counter, an invoice in the inbox -- and what the accountant actually needs is *those documents, categorized, totaled, and exportable*. Everything between those two facts is ceremony.

LedgerLens is only the pipeline: a receipt inbox (email-forward an invoice, photo a receipt), AI extraction and categorization with explicit confidence flags, and a monthly close package (PDF summary + CSV/QBO/Xero export + the source images) the accountant imports in minutes. It is **not accounting software** -- it is the thing that feeds one.

## Target User

- **Primary:** US solo operators and micro-businesses (0-3 people) with real expense volume: trades, field services, freelancers, e-commerce sellers, contractors' sole-proprietor subs. They have an accountant or tax preparer they see quarterly or annually.
- **Secondary:** the accountants and bookkeepers themselves, who push the tool to their messiest clients so January stops being archaeology. Each accountant is a channel to 20-200 shoebox clients.
- **Buyer profile:** someone who has paid a cleanup fee at least once, or been scolded by their accountant. They will forward one email and photograph one receipt in the first session; if that works, the habit forms.
- **Not a target (yet):** businesses with employees and payroll, anyone who wants invoicing/AR, or companies already living inside QuickBooks Online daily.

## Market & Profitability

- **The market is enormous and underserved at the bottom.** The US Census counts **29.8 million nonemployer businesses** with $1.7 trillion in combined receipts as of 2022, and their number has grown faster than employer businesses nearly every year since 2012 ([census.gov](https://www.census.gov/library/stories/2025/07/nonemployer-business-growth.html), [census.gov](https://www.census.gov/programs-surveys/nonemployer-statistics.html)). Even a fraction of a percent of that base at $19-79/mo is a durable business.
- **The category has proven willingness to pay.** Dext -- the incumbent "pre-accounting" tool -- charges roughly **$25-32/mo for its business plan** and sells accountant plans at ~$18-19 per client per month with a 10-client minimum ([dext.com](https://dext.com/us/business/pricing), [costbench.com](https://costbench.com/software/accounting/dext/)). Dext, Hubdoc, and AutoEntry built real revenue on exactly this workflow -- but all three are designed for and sold to *accounting firms*, not to the operator with a shoebox.
- **Realistic ceiling:** this is a volume niche, not winner-take-all: **$15k-$100k MRR** over 2-4 years (roughly 500-3,000 customers at ~$30 blended ARPU) is a credible path, with accountant-channel distribution as the main variable.
- **Why margins hold:** extraction is the only variable cost, and at current model pricing a receipt costs well under a cent to process (see ARCHITECTURE.md); gross margin stays above 85% at every tier. Churn is seasonal risk (tax-time signups), mitigated by monthly close emails that show accumulated value.

## Monetization & Pricing

Tiered by document volume -- the honest usage axis -- with everything else included everywhere. Annual billing at 2 months free, positioned against the cleanup fee ("a year of LedgerLens costs less than one January").

| Plan | Price | Documents/mo | Includes |
|---|---|---|---|
| **Solo** | $19/mo | up to 75 | Receipt inbox (email + photo), AI extraction + categorization, confidence review queue, monthly close package, CSV export |
| **Operator** | $39/mo | up to 300 | Everything in Solo + QBO/Xero export formats, mileage log, recurring-vendor rules, accountant guest access (read-only) |
| **Pro** | $79/mo | up to 1,000 | Everything in Operator + multiple entities, bank-feed CSV matching, priority extraction, API export |

Notes on the model:

- **The trial is the extraction demo.** 14 days, no card: forward five emails, photo five receipts, watch them become categorized line items. The first close package sells the subscription.
- **Overage is soft:** documents past the cap queue until the next cycle or an upgrade -- never a surprise bill, never data hostage-taking.
- **No free tier.** A free tier fills the queue with tire-kickers whose extraction costs are real; the $19 floor filters for people with an actual shoebox problem.

## MVP Feature List

- [ ] Auth + org setup (Auth.js, magic link); per-org forwarding address `docs+{org}@in.ledgerlens.app`
- [ ] Inbound email ingestion (attachment + body parsing, deduplication by content hash)
- [ ] Mobile photo capture (PWA camera flow) with client-side crop/deskew hints
- [ ] Document storage (originals kept forever, served signed-URL only)
- [ ] Extraction worker: vendor, date, total, tax, currency, line summary via Anthropic API; every field carries a confidence score
- [ ] Categorization to a Schedule-C-aligned category set, learned per-vendor rules ("Home Depot is always Supplies")
- [ ] Review queue: low-confidence fields flagged for a one-tap confirm/correct flow; corrections train vendor rules
- [ ] Duplicate detection (same vendor + amount + date window) with merge flow
- [ ] Monthly close package: PDF cover summary (totals by category, flagged items, missing-receipt gaps), CSV in QBO- and Xero-importable formats, ZIP of source images
- [ ] Accountant share link (read-only, no login) for the close package
- [ ] Billing for LedgerLens itself (Stripe Billing, three tiers, document metering)
- [ ] Email digests: weekly "12 documents processed, 2 need review" nudge

Post-MVP (explicitly cut from v1): bank feed connections (Plaid), mileage auto-tracking, receipts-to-bank matching, multi-entity, API, mobile native apps.

## Differentiation

1. **Built for the operator, not the firm.** Dext/Hubdoc onboard through an accountant and price per client seat; LedgerLens onboards through a forwarded email and prices like a phone app. The operator owns the account; the accountant gets a share link.
2. **Confidence flags instead of silent guesses.** Every extracted field shows its confidence; anything below threshold lands in a one-tap review queue. Competitors silently write wrong totals into the ledger and the accountant finds them in March. Trust in the export is the entire product.
3. **The close package is the artifact.** Not a dashboard to visit -- a monthly deliverable (PDF + CSV/QBO/Xero + source images) designed to be *received by an accountant*. Nobody in the category treats the accountant handoff as the product.
4. **Not accounting software, loudly.** No chart of accounts, no reconciliation, no double entry. This narrowness is the positioning: "keep your accountant; fire your shoebox."
5. **Vendor rules that learn from corrections.** One correction ("this Shell station is Fuel, not Meals") becomes a permanent rule, so review volume drops month over month -- the product gets quieter with use, which is retention.

## Go-to-Market Channels

In priority order:

1. **Accountant/bookkeeper referral loop.** Every close package footer says "prepared with LedgerLens." A referral program (20% recurring, or free months for the client) turns tax preparers into distribution -- they have the January pain too and actively want their shoebox clients on *something*.
2. **Tax-season SEO.** "receipt organizer for taxes," "how much do accountants charge to clean up books," "QuickBooks too complicated," "shoebox receipts tax." High-intent, seasonal spikes; publish 10-15 deep articles plus a **cleanup-fee calculator** (hours x rate = what your shoebox costs) as the lead magnet.
3. **Trade and gig communities.** r/smallbusiness, r/freelance, r/Entrepreneur, trade-specific Facebook groups (plumbing, lawn care, cleaning). The "my accountant charged me $500 to sort receipts" thread recurs weekly; be the standard answer.
4. **App-store presence via PWA-to-store wrappers later**, but day one the mobile capture flow is shareable as a link -- low-friction demos in DMs and group chats.
5. **Partnerships with tax-prep franchises' local offices** (H&R Block-adjacent independents) who see the shoebox parade every spring.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Dext** | ~$25-32/mo business; ~$18-19/client for firms | Firm-first onboarding and UX; priced/packaged for accountants managing clients; overkill features for a solo operator. |
| **Hubdoc (Xero)** | Bundled with Xero (~$3.50 standalone legacy) | Requires living in Xero; document fetch focus; extraction quality dated; no operator-facing close artifact. |
| **QuickBooks Solopreneur** | ~$20/mo | It's accounting software -- the exact ceremony the target refuses; receipt capture is a side feature; lock-in to QBO. |
| **Wave** | Free + paid add-ons | Free but full accounting UI; receipt OCR basic; no accountant deliverable; monetizes payments, so the bookkeeping side stagnates. |
| **Expensify** | ~$5-9/seat | Built for employee expense reports and reimbursement, not proprietor books; wrong mental model for a sole trader. |
| **The shoebox + Excel** | Free | The real competitor. Beaten only by making capture genuinely effortless (forward or photo, nothing else) and the payoff visible monthly. |

## Key Risks

1. **Extraction errors destroy trust.** One wrong total in a tax export is worse than no product. Mitigation: confidence thresholds tuned conservative (flag, don't guess), field-level provenance (tap any number to see the source crop), and the review queue as a first-class flow -- accuracy honesty is the brand.
2. **Incumbent bundling.** Intuit or Xero could make capture-to-close free inside their suites. Mitigation: they structurally won't serve the "no accounting software" segment without cannibalizing upgrade paths; stay the independent front door and export to all of them.
3. **Seasonality churn.** Tax-time signups may cancel in May. Mitigation: monthly close emails that quantify accumulated value ("$1,840 of deductions captured this quarter"), annual pricing anchored against the cleanup fee, and vendor rules that make month 6 quieter than month 1.
4. **Email deliverability and ingestion abuse.** The forwarding address is an open inbox. Mitigation: per-org addresses with signed tokens, sender verification, size/type limits, spam scoring before the extraction queue, and hard caps per plan.
5. **Cost blowout on document volume.** A user forwarding their whole mailbox could spike API costs. Mitigation: plan caps with soft queueing, pre-filtering non-financial documents with a cheap classifier pass, and per-org rate limits.
6. **Category liability.** Users may treat categorization as tax advice. Mitigation: Schedule-C-aligned categories with plain disclaimers, accountant review positioned as the final step -- LedgerLens prepares, a professional files.

## Running it locally

```bash
# 1. Dependencies (from the repo root, which shares one toolchain)
node tools/link-deps.mjs apps/35-ledgerlens --kit web

# 2. Environment
cp .env.example .env.local     # DATABASE_URL and AUTH_SECRET are the only required values

# 3. Database
npm run db:migrate

# 4. Run
npm run dev                    # http://localhost:3035
```

Then sign up. You get a forwarding address and a camera, and nothing else to
configure.

**What works without cloud credentials.** Every path in the MVP list runs on a
laptop with only Postgres:

- **No `R2_*` set** — originals go to a filesystem driver under
  `LOCAL_STORAGE_DIR`. Same content-addressed keys, same signed-URL-only access;
  the camera's signed `PUT` lands on `/api/uploads/put` instead of on R2.
- **No `ANTHROPIC_API_KEY`** — extraction falls back to a deterministic reader.
  For an emailed invoice it genuinely parses the text (vendor, date, total, tax,
  line items) with honest per-field confidence. For a *photo* it cannot see
  anything, so it produces a stable low-confidence reading that always lands in
  the review queue. Every document names the reader that produced it.
- **No `RESEND_API_KEY`, or `DRY_RUN=1`** — digests, close emails and review
  nudges are logged with their exact copy instead of being delivered.
- **No `STRIPE_SECRET_KEY`** — the billing screen shows the plans and explains
  that checkout is unavailable. Plan gating still applies.

**Forwarding an email locally.** The inbound webhook verifies an Svix-style
signature and refuses everything while `RESEND_WEBHOOK_SECRET` is unset. To post
a test message, sign the body the way Resend does:

```bash
BODY='{"to":"docs+your-slug@in.ledgerlens.app","subject":"Fwd: invoice","text":"SHELL OIL 574288\nInvoice date: 2026-03-12\nTotal   64.55\n"}'
TS=$(date +%s); ID=msg_local
SIG=$(printf '%s.%s.%s' "$ID" "$TS" "$BODY" \
  | openssl dgst -sha256 -mac HMAC -macopt "key:$(echo -n "$RESEND_WEBHOOK_SECRET" | sed s/^whsec_// | base64 -d)" -binary \
  | base64)
curl -X POST localhost:3035/api/webhooks/inbound-email \
  -H "content-type: application/json" -H "svix-id: $ID" \
  -H "svix-timestamp: $TS" -H "svix-signature: v1,$SIG" --data "$BODY"
```

**Scheduled work.** Extraction, the monthly close, the review-nudge ladder and
the weekly digest all live in one idempotent sweep:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3035/api/cron/tick
```

In production that is a once-daily Vercel cron (`vercel.json`). Running it more
often is harmless: extraction claims each document with a conditional `UPDATE`,
closes are versioned rebuilds, and every email is behind a unique key pinned to a
fixed date. `npm run worker` runs the same sweep on an interval for hosts that
have always-on processes, and is not required on Vercel.

### Checks

```bash
npm run typecheck
npm test
npm run build
```
