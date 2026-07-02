# ParseFlow

**Document-parsing API for developers: POST a PDF or image, get clean structured JSON back — with per-field confidence scores, async webhooks for batch jobs, and a hosted playground.**

```bash
curl -X POST https://api.parseflow.dev/v1/parse \
  -H "Authorization: Bearer pf_live_..." \
  -F "file=@invoice.pdf" -F "schema=invoice"
# → {"vendor_name": {"value": "Acme GmbH", "confidence": 0.98}, "total": {"value": 1249.00, ...}}
```

## The Problem

Every SaaS backend eventually hits the same wall: a customer uploads an invoice, a receipt, a bank statement, an ID, or a resume — and someone has to turn that blob into rows in a database. The current options are all bad in a specific way:

- **Regex + pdfplumber in-house**: works for one vendor's invoice layout, breaks on the second. Maintenance becomes a permanent tax.
- **Cloud giants (Textract, Azure Document Intelligence, Google Document AI)**: powerful but built for enterprises — confusing SKU matrices, per-feature pricing, verbose nested JSON responses that need a second parsing layer, and docs written for procurement departments.
- **Vertical vendors (Mindee, Veryfi)**: good accuracy, but "contact sales" pricing walls, per-document-type endpoints, and custom fields mean training a model or paying for professional services.

The actual job is simple to state: *document in, JSON out, tell me how confident you are per field.* ParseFlow does exactly that, priced per page, documented like Stripe.

## Target User

Backend and full-stack developers at **SaaS companies, fintechs, prop-tech, and HR-tech** — teams that need documents turned into data *this sprint* and will never train an ML model. Typical buyer: a senior engineer with a company card and a $200/mo discretionary budget who evaluates by reading the docs and hitting the playground, not by booking a demo. Secondary: automation builders wiring n8n/Zapier/Make flows that ingest invoices or receipts.

## Market & Profitability

Document-AI APIs are a validated niche: small teams in this space (Mindee pre-Series A, various indie OCR APIs on RapidAPI) have demonstrated **$5k–$50k MRR** without enterprise sales motions. The market is large (every business receives invoices) but the realistic wedge is developers priced out or annoyed by the incumbents.

Grounded expectations, not hype:

- **$5k MRR ≈ 25–50 paying developers** (mix of $99 Startup plans and pay-as-you-go accounts averaging ~$100–200/mo). Achievable in **12–18 months** with consistent content + launch work, no paid acquisition.
- **$20k MRR** is the realistic 3-year ceiling for a solo/duo team without outbound sales — it requires ~10 Scale-tier customers or ~150 mixed accounts.
- Usage-based revenue compounds: a customer who integrates ParseFlow into their ingestion pipeline grows their bill as *their* business grows, with near-zero churn (rip-out cost is high once webhooks and schemas are wired in).
- Unit economics support this: ~$0.01/page revenue vs. ~$0.004/page COGS (LLM + OCR compute) → **~60% gross margin** at list price, improving with volume-tier commitments (see ARCHITECTURE.md for the full breakdown).

## Monetization & Pricing

Transparent, flat, per-page. No "contact sales" wall until genuinely enterprise volumes.

| Plan | Price | Included pages/mo | Effective $/page | Overage |
|---|---|---|---|---|
| **Free** | $0 | 100 | — | hard stop (upgrade prompt) |
| **Pay-as-you-go** | metered | 0 | $0.010 | n/a (pure metered) |
| **Startup** | $99/mo | 15,000 | $0.0066 | $0.008/page |
| **Scale** | $499/mo | 100,000 | $0.0050 | $0.006/page |
| **Enterprise** | custom | 500k+ | <$0.005 | negotiated; SLA + DPA + SSO |

- Billing via **Stripe metered subscriptions**: page counts reported as usage records, invoiced monthly.
- **Annual discount: 2 months free** (pay for 10) on Startup and Scale — improves cash flow and locks in the integration.
- Custom-schema extraction (bring your own JSON Schema) is included on all paid tiers, not an upsell — it is the differentiation, not a revenue lever.
- A "page" = one rendered page of a PDF or one image. Multi-page PDFs bill per page; this is the industry-standard unit (Textract, Mindee) so comparisons are easy.

## MVP Feature List

- [ ] API-key auth (`pf_live_...` / `pf_test_...`, hashed at rest, per-key revocation)
- [ ] `POST /v1/parse` — synchronous parse of PDF/PNG/JPG up to 10 pages, returns structured JSON + per-field confidence
- [ ] Built-in schemas: `invoice`, `receipt` (launch), `bank_statement`, `id_card`, `resume` (fast-follow)
- [ ] Text-layer extraction via pdfplumber with automatic OCR fallback (Tesseract) for scanned docs
- [ ] Claude-powered structured extraction against the selected schema (strict JSON Schema output)
- [ ] Per-field confidence scores (0–1) derived from source-text grounding + model self-assessment
- [ ] `POST /v1/parse/batch` — async batch jobs (up to 1,000 docs) processed by Celery workers
- [ ] `GET /v1/jobs/{id}` — job status polling
- [ ] Webhook delivery on job completion, HMAC-SHA256 signed, 3 retries with exponential backoff
- [ ] Custom schemas: customer submits their own JSON Schema, gets it filled with extracted values + confidence
- [ ] Stripe metered billing: usage recorded per parsed page, reported to Stripe within the hour
- [ ] Free-tier enforcement (100 pages/mo, hard stop) and spend caps for pay-as-you-go
- [ ] Hosted playground: drag-and-drop a document, see JSON output live, copy the equivalent curl
- [ ] Docs site: quickstart in <5 minutes, full API reference, error catalog
- [ ] Uploaded documents stored in S3-compatible storage with 30-day auto-deletion default
- [ ] Rate limiting per key (60 req/min sync; burst-friendly for batch)
- [ ] Sentry error tracking + structured request logging with request IDs

## Differentiation

1. **Dev-first DX.** Stripe-quality docs, a playground that generates working code, SDKs (Python/JS) at launch of Phase 3, test-mode keys, and error messages that tell you what to fix. Azure and Google make you read 40 pages before your first successful call; ParseFlow's quickstart is one curl.
2. **Transparent flat per-page pricing.** Public price list, self-serve card signup, no sales call. Mindee and Veryfi hide real pricing behind quote forms; AWS/Azure pricing requires a spreadsheet to estimate. "$0.01/page, volume discounts published" is itself a marketing message.
3. **LLM-powered custom schemas.** The customer sends *their own JSON Schema*; ParseFlow fills it with extracted values and per-field confidence. No training, no annotation UI, no per-doc-type endpoint. This is the feature the incumbents structurally can't ship cheaply — their pipelines are per-document-type trained models, ours is schema-conditioned extraction.

## Go-to-Market

Specific channels, in order of expected ROI:

1. **Show HN launch** — "Show HN: ParseFlow – POST a PDF, get JSON with confidence scores." The playground link is the whole pitch; HN loves transparent pricing pages.
2. **Technical SEO / dev.to** — target long-tail intent queries developers actually type: *"parse invoice PDF python"*, *"extract table from bank statement"*, *"pdfplumber vs OCR"*, *"resume parsing API"*. Each article ends with a 5-line ParseFlow snippet. 2 posts/month, compounding.
3. **RapidAPI marketplace listing** — free distribution to developers already searching for "OCR API" / "invoice parser"; the freemium tier maps cleanly onto RapidAPI's model.
4. **r/webdev, r/SaaS, r/selfhosted** — answer "how do I parse invoices" threads with genuinely useful advice + disclosure. No launch spam; presence over promotion.
5. **Integration tutorials for n8n / Zapier / Make** — "Auto-file email invoices into Google Sheets" style recipes. Automation users are high-volume, low-touch customers, and these platforms' template galleries are durable acquisition surfaces.
6. **Open-source funnel** — release a small, genuinely useful Python package (e.g. `pdf-text-or-ocr`: one function that returns text via pdfplumber or Tesseract, whichever works). README links to ParseFlow for the structured-extraction step. Cheap to build, permanent top-of-funnel.

## Competition

| Competitor | Pricing | Strength | Weakness ParseFlow exploits |
|---|---|---|---|
| **Mindee** | Free 250 docs/mo, then opaque quote-based | Strong pre-trained invoice/receipt models, nice docs | Custom fields need their training workflow; real pricing behind sales; per-doc-type API endpoints |
| **Veryfi** | ~$500/mo entry, quote-based | Fast, accurate receipts/invoices; mobile SDKs | Priced for mid-market+; no self-serve low tier; custom schemas are a services engagement |
| **Azure Document Intelligence** | ~$1.50/1k pages (read) to $10/1k (prebuilt invoice) | Cheap at raw-OCR tier, enterprise compliance | SKU maze, Azure account required, verbose nested output, custom models need labeled training data |
| **AWS Textract** | ~$1.50/1k pages (text), $50/1k with queries/forms | Scales infinitely, deep AWS integration | No semantic schemas — you get key-value pairs and geometry, then build your own mapping layer; pricing spreadsheet required |
| **Google Document AI** | ~$1.50/1k (OCR) to $30/1k (specialized parsers) | Best-in-class OCR quality | Per-processor pricing and setup; custom extractors require training in their console; GCP onboarding friction |

The pattern: incumbents are cheap for *raw text* and expensive/complex for *structured meaning*. ParseFlow sells the meaning layer at a flat price.

## Key Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **LLM cost per page squeezes margin** | COGS is ~$0.002–0.004/page today; a pricing change or heavier prompts could halve margin | Route simple docs to a cheaper model tier (Haiku-class) and reserve Sonnet-class for complex/custom schemas; aggressive prompt caching of schema prompts; renegotiate at volume; COGS trend has been *down* year over year |
| **Accuracy liability on financial docs** | A silently wrong invoice total costs the customer real money and us the account | Per-field confidence scores are the product answer — document that fields below 0.9 need human review; never claim 100% accuracy; ToS disclaims fitness for unattended financial decisions; ship a review-queue example app |
| **Big-cloud price cuts / feature catch-up** | AWS/Google could ship "LLM schema extraction" at cost | Compete on DX and speed of iteration, not price floor; stay the "no sales call, no SKU matrix" option; custom schemas + playground keep switching costs asymmetric |
| **PII / compliance burden** | Invoices, IDs, bank statements are PII-dense; EU customers will ask about GDPR day one | 30-day default retention with zero-retention option per key; EU region bucket (R2 supports location hints); DPA template at launch; SOC 2 prep in Phase 3 before chasing bigger logos; never use customer docs for training |
| **Free-tier abuse** | 100 free pages × unlimited signups = OCR-for-free farm | Card-on-file for pay-as-you-go, email verification + per-IP signup limits for free tier, hard stop (not overage) at 100 pages |
