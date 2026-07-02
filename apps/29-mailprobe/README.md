# MailProbe

**An email verification API developers actually like: accurate deliverability checks, transparent pricing, honest "unknown" results.**

---

## The Problem

Every product with a signup form, every sales team with a lead list, and every newsletter with an aging audience has the same problem: bad email addresses. Typos at signup, decayed lists, disposable addresses, spam traps. The costs are concrete — bounced campaigns damage sender reputation (get above ~2% bounces and Gmail starts junking you), CRMs fill with dead leads, and transactional email spend is wasted.

Email verification is a proven, decades-old market (ZeroBounce, NeverBounce, Kickbox, Hunter) — and it's ripe for the classic dev-first squeeze: incumbents price at $0.007–$0.01/verification with enterprise-sales friction, clunky dashboards, and accuracy claims nobody can audit. Developers want a clean API, honest confidence scoring, and pricing that doesn't require a call.

## Target User

- **Primary:** developers embedding real-time verification at signup (SaaS, e-commerce, newsletters) — the recurring, growing usage.
- **Secondary:** marketers cleaning lists before campaigns (bulk CSV jobs — spiky but high volume); agencies cleaning client lists.
- **Not targeting:** cold-outreach spam operations — explicit ToS exclusion; it's both an ethics line and a deliverability-infrastructure protection (their traffic patterns poison verification infrastructure for everyone).

## Market & Profitability

- Incumbents demonstrate deep willingness to pay: list cleans of 100k addresses run $400–$800 at market rates; realtime API usage compounds monthly.
- Realistic outcome: **$5k–$50k MRR.** Infrastructure APIs grow slowly but churn barely at all once embedded in a signup flow — it's swap-cost revenue.
- Unit economics: a verification costs fractions of a cent in compute/network; sold at $0.003–$0.008 — **90%+ margins** with volume discounting room to undercut incumbents by 30–50%.
- The hard part is the moat: verification accuracy (especially catch-all detection) improves with volume and infrastructure investment (IP pool reputation for SMTP probes) — a real barrier once crossed, which is why the niche stays profitable.

## Monetization

| Plan | Price | Included |
|------|-------|----------|
| Free | $0 | 250 verifications/mo, full API |
| Pay-as-you-go | $0.006/verification | No commitment, volume breaks at 50k/250k/1M |
| Growth | $49/mo | 10,000/mo + realtime widget |
| Scale | $249/mo | 75,000/mo + priority throughput + dedicated support |

Simple public pricing (no "contact us") is itself the marketing.

## MVP Features

- [ ] `/v1/verify` single-address endpoint: syntax → domain/MX → disposable/role detection → mailbox probe → result {deliverable | undeliverable | risky | unknown} + sub-signals (catch-all, disposable, role, free-provider, typo-suggestion)
- [ ] **Honest scoring:** confidence 0–100 with reasons; "unknown" is a real answer (competitors' fake certainty on catch-alls is the industry's dirty secret)
- [ ] Typo suggestions ("gamil.com → gmail.com") — the highest-ROI feature for signup forms
- [ ] Bulk jobs: CSV upload / API batch → async processing → webhook + downloadable results
- [ ] Realtime JS widget for signup forms (debounced, <400ms budget)
- [ ] Dashboard: usage, result distribution, API keys, team access
- [ ] Stripe metered billing; clear per-result accounting

## Differentiation

1. **Honest unknowns + audit-friendly accuracy:** publish the methodology and a public accuracy benchmark set; mark catch-alls as catch-alls instead of guessing. Devs distrust this category — transparency is the wedge.
2. **DX:** one-line curl to first verification, great docs, typed SDKs (Node/Python), a widget that just works.
3. **Transparent pricing** 30–50% under incumbents with no sales call.

## Go-to-Market

- Dev-first channels: Show HN, dev.to/blog engineering posts ("how email verification actually works — and why every catch-all claim is a lie"), open-source the syntax/disposable layers as a free library (top-of-funnel + trust).
- SEO: "NeverBounce alternative", "email verification API", per-framework guides ("verify emails in Next.js signup").
- Marketplace listings: RapidAPI, Zapier/Make apps for the no-code bulk-clean audience.
- Free tier generous enough to embed in side projects that grow into customers.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| ZeroBounce | ~$0.008+/check | Marketing-heavy, opaque accuracy, upsell maze |
| NeverBounce | ~$0.008/check | Aging product, enterprise-sales friction |
| Kickbox | ~$0.008+/check | Solid but pricey; weak free tier |
| Hunter | Bundled | Verification is a side feature of prospecting |

## Key Risks

- **SMTP-probe infrastructure is genuinely hard:** mailbox providers throttle/block probing IPs; requires warmed IP pools, rotation, and per-provider strategies (and Gmail/Yahoo largely don't answer — hence honest catch-all/unknown handling). Phase the buildout; start with the 80% achievable via DNS/MX/pattern/data layers.
- **Abuse magnetism:** spammers want this tool; strict ToS, signup vetting, rate anomaly detection, and refusing list-cleaning for cold-outreach use cases protect the IP reputation the business depends on.
- **Data-privacy surface:** processing third-party PII (email lists) demands GDPR-grade handling: retention windows, DPAs, EU processing options.
- **Incumbent price response:** they have margin to cut; the durable edges are DX, transparency, and the dev-embedded use case they underserve.
