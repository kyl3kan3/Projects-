# ParseFlow Roadmap

## Phase 0 — Setup (week 0)
- FastAPI app + Postgres + Redis + Celery scaffolding runs locally via docker-compose
- API-key issuance + auth middleware working end-to-end

**Done when:** `curl -H "Authorization: Bearer pf_test_..."` hits an authenticated stub.

## Phase 1 — MVP (weeks 1–5)
- `/v1/parse` sync endpoint for invoices + receipts (pdfplumber → OCR fallback → Claude extraction)
- Built-in schemas: invoice, receipt; per-field confidence scores
- Usage metering (pages) + free tier (100 pages/mo) + Stripe metered billing
- Hosted playground page (upload → JSON side-by-side)
- OpenAPI docs polished; Python + Node quickstart snippets

**Done when:** a stranger can sign up, parse 10 invoices from the playground, and get billed correctly past the free tier; field-level accuracy ≥92% on the internal invoice test set.

## Phase 2 — Launch (weeks 6–9)
- Async batch mode + signed webhooks with retries
- Custom schemas: POST your own JSON schema, get it filled (the differentiator)
- bank_statement, id, resume schemas
- Launch: Show HN, dev.to writeup, listings on RapidAPI-style marketplaces + api.docs directories

**Done when:** first 10 paying accounts; p95 sync parse < 8s/page; webhook delivery ≥99.5%.

## Phase 3 — Growth (months 3–6)
- Accuracy eval harness public page (transparent benchmarks vs Mindee/Veryfi)
- Zapier/Make connectors (no-code buyers)
- Volume tiers + committed-use pricing; SOC 2 prep + data-retention controls
- Fine-tuned extraction for top-3 customer document types

**Done when:** $5k MRR; ≥1 customer >5k pages/mo; churn <3%/mo.
