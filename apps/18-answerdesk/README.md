# AnswerDesk

**An embeddable AI support chatbot trained on your docs — with honest analytics that tell you what it *couldn't* answer, and flat pricing that doesn't punish you for success.**

---

## The Problem

Every support team answers the same 30 questions forever. "How do I reset my password?" "Do you integrate with Shopify?" "Where's my invoice?" A 3-person support team at a growing SaaS spends 60–70% of ticket volume on questions already answered in their docs — the customer just didn't read them (and never will).

The existing AI-bot options are bad in two distinct ways:

1. **Per-resolution pricing scales against you.** Intercom Fin charges ~$0.99 *per resolution* on top of Intercom seat fees. The better the bot performs, the bigger your bill. A bot that deflects 2,000 tickets/month costs ~$2,000/month — for answering questions your docs already answer. Success is punished.
2. **Cheap bots hallucinate confidently and hide their failures.** Generic wrappers (Chatbase, most SiteGPT clones) will answer *anything* — including things not in your docs — with total confidence and zero citations. Worse, none of them show you an honest failure log. You get a vanity "conversations handled" number and no idea how many customers got a wrong answer and silently churned.

Nobody in this market tells you the truth: what the bot couldn't answer, how often it guessed, and which articles you should write next. AnswerDesk's entire product thesis is that **honesty about failure is the feature.**

## Target User

SaaS companies and e-commerce stores with **1–10-person support teams** drowning in repetitive tickets:

- They have real docs/help-center content (a `/docs` site, a Zendesk/HelpScout knowledge base, a Shopify FAQ).
- They handle 500–10,000 tickets/month; a meaningful chunk is doc-answerable.
- They've been burned by (or are rationally suspicious of) per-resolution pricing — they can do the math on what Fin costs at their volume.
- They can't afford a wrong answer telling a customer the wrong refund policy. They want citations and a graceful "let me get a human" — not confident fiction.

**Anti-target:** enterprises with dedicated support-ops tooling teams (they'll buy Fin/Zendesk AI), and companies with no written docs (nothing to train on — we'll tell them that honestly too).

## Market & Profitability

AI-support-bot SaaS realistically lands in the **$10k–$80k MRR** band for an indie/small-team product — this is a crowded category where distribution, not tech, is the constraint. The plan is built around that reality, not a unicorn fantasy.

**Realistic trajectory:** ~150 customers averaging ~$80/mo blended ≈ **$12k MRR in 18–24 months**. Getting there requires ~7 net-new customers/month after launch — achievable with comparison-SEO pages plus cold outreach (see Go-to-Market).

**Unit economics:**

- LLM COGS per answered message: roughly **$0.005–$0.02** (Claude call with ~2–4k tokens of retrieved context, plus a fraction of a cent for the query embedding).
- A Starter customer at full usage (500 msgs/mo) costs us ~$2.50–$10 in inference against $39 revenue.
- A Scale customer at 10,000 msgs/mo costs ~$50–$150 against $199 — thinnest tier, protected by overage pricing and prompt-caching of the system/brand prompt.
- Blended **gross margin ~80–85%** at these price points, degrading only if we let context windows bloat (mitigation: hard top-k retrieval cap, aggressive chunk trimming, cached common answers).

**Why customers pay:** one deflected ticket is worth ~$3–8 of support-agent time. A bot deflecting 300 tickets/month returns 20–60x the $39 subscription. The ROI math is trivially in our favor at flat pricing — which is exactly why per-resolution competitors don't price flat.

## Monetization & Pricing

Flat, per-site pricing. Predictable. No per-resolution tax.

| | **Starter — $39/mo** | **Growth — $99/mo** | **Scale — $199/mo** |
|---|---|---|---|
| Bots | 1 | 3 | 10 |
| Messages / mo | 500 | 2,000 | 10,000 |
| Cited answers | ✅ | ✅ | ✅ |
| Unanswered-questions log | ✅ | ✅ | ✅ |
| Deflection dashboard | ✅ | ✅ | ✅ |
| Content-gap report | ✅ | ✅ | ✅ |
| Human handoff (email) | ✅ | ✅ | ✅ |
| Human handoff (Slack) | — | ✅ | ✅ |
| API access | — | — | ✅ |
| Remove "Powered by AnswerDesk" | — | — | ✅ |
| Priority crawl (daily re-index) | — | — | ✅ |

**Overage:** $5 per extra 500 messages, hard-capped by default (bot politely defers + hands off when cap is hit) — customers opt *in* to overage billing, never surprise-billed. This is a trust product; billing surprises kill trust.

**Annual:** 2 months free (16% off). Free 14-day trial, no card required — the "test your bot" playground is the conversion engine.

## MVP Feature List

- [ ] URL + sitemap crawl (Playwright for JS-rendered sites, sitemap.xml parsing, robots.txt respect)
- [ ] Content chunking + embedding + pgvector indexing pipeline
- [ ] Re-crawl scheduling (weekly default, daily on Scale)
- [ ] Embeddable chat widget (one `<script>` tag, vanilla JS, <30KB gzipped)
- [ ] Cited answers — every answer links to ≥1 source page, or the bot doesn't answer
- [ ] Confidence scoring on every response
- [ ] Confidence-gated handoff to email (Resend): below threshold → collect email → notify team
- [ ] Slack handoff channel (Growth+): low-confidence conversations posted to a channel
- [ ] Unanswered-questions log — every question the bot declined or hedged on, verbatim
- [ ] Deflection dashboard — resolved-without-human rate, honest methodology shown
- [ ] Content-gap report v1 — cluster unanswered questions, output "write these N articles to deflect ~X% more"
- [ ] Stripe subscription billing (3 tiers + metered overage, customer portal)
- [ ] Usage metering with soft/hard message caps
- [ ] Bot appearance settings (colors, avatar, greeting, brand tone hint)
- [ ] Test-your-bot playground (ask questions against your index before embedding)
- [ ] Multi-bot management per org (Growth/Scale)

## Differentiation

1. **Honest deflection analytics.** Competitors report vanity metrics and hide failure modes. We ship an unanswered-questions log and a deflection number we invite you to audit. Trust is the moat.
2. **Content-gap reports.** "Write these 12 articles to deflect ~40% more tickets" — we turn our failures into your content roadmap. No competitor turns bot failure into customer value.
3. **Flat per-site pricing.** Per-resolution fees punish success. Our customers' costs are flat while their ROI compounds.
4. **Citations on every answer.** No citation → no answer. Structural, not optional.
5. **Graceful handoff instead of hallucination.** Below the confidence threshold, the bot says so and gets a human — via email or Slack. A bot that says "I don't know" is worth more than one that lies.

## Go-to-Market

1. **Comparison-SEO pages (week 1 of launch):** "Intercom Fin alternative", "Chatbase alternative", "SiteGPT alternative", "Intercom Fin pricing calculator" (interactive: enter your ticket volume, see the per-resolution bill vs. our flat price). These convert high-intent, price-shocked searchers.
2. **Cold outreach to SaaS with visible `/docs` sites:** scrape a list of SaaS companies with public docs + a support email, and send them *a working demo bot already trained on their own docs* with its first content-gap report. The demo is the pitch.
3. **Template gallery of live demo bots** trained on famous public docs sites (e.g. well-known OSS projects) — each demo page is linkable marketing and an SEO asset.
4. **Product Hunt launch** with the playground as the hook: paste your URL, chat with your bot in 90 seconds.
5. **Integration listings:** Slack App Directory (the handoff app is a real distribution surface), and later Zendesk/Crisp marketplaces.
6. **Communities:** r/SaaS, Indie Hackers build-in-public thread, and support-ops communities — especially **Support Driven Slack**, where "honest deflection metrics" is a genuinely resonant message with practitioners burned by vendor vanity metrics.

## Competition

| Competitor | Pricing | Strength | Weakness AnswerDesk exploits |
|---|---|---|---|
| **Intercom Fin** | ~$0.99/resolution + Intercom seats | Best-in-class quality, huge distribution | Cost scales against you; requires Intercom; opaque failure reporting |
| **Chatbase** | From ~$40/mo | Cheap, fast setup | Generic wrapper; weak citations; no failure analytics; hallucination-prone |
| **SiteGPT** | ~$49+/mo | Similar positioning, decent crawl | No content-gap intelligence; analytics are vanity metrics |
| **Zendesk AI** | Add-on to Zendesk plans | Deep ticket integration | Requires Zendesk; enterprise pricing; not embeddable standalone |
| **DocsBot** | ~$19–$499/mo | Doc-focused, API | No honest deflection reporting; no handoff-first design |

## Key Risks

| Risk | Mitigation |
|---|---|
| **Foundation-model providers bundle this for free** (e.g. site-chat becomes a commodity feature) | Our value is the analytics + handoff workflow, not the chat. Deflection truth, content-gap reports, and Slack-native escalation are product surface a raw model doesn't ship. Move upmarket into support-ops insight. |
| **Per-message LLM cost spikes from abuse** (bot spam, scraping our endpoint) | Hard message caps per plan, per-visitor rate limits, bot/CAPTCHA heuristics on the widget, cached answers for repeated questions (top 20 questions ≈ high cache-hit rate), token budget ceilings per response. |
| **Accuracy/liability of wrong answers** (bot misstates refund policy) | Confidence gating (no citation → no answer → handoff), citations let users verify, customer-configurable blocked topics, prominent "AI answer — verify" affordance, ToS liability language. Honesty positioning means we *under*-answer by design. |
| **Crawl blocking / anti-bot walls** (Cloudflare challenges, JS walls) | Identified `CRAWLER_USER_AGENT` with docs page for allowlisting, respect robots.txt (goodwill + legality), Playwright for JS rendering, fallback to manual file/markdown upload and sitemap-only mode, per-domain rate limiting to stay polite. |
| **Crowded category / distribution failure** | Comparison-SEO + demo-bot outreach are cheap, measurable channels; the pricing-calculator page targets the exact moment of competitor price shock. If CAC doesn't work in 6 months, the honest answer is to niche down (e.g. "for Shopify stores"). |
