# RankRadar

**Rank tracking + AI content briefs for small SEO teams — agency features without the Ahrefs price tag.**

---

## The Problem

A 3-person content agency or an in-house SEO of a small company needs three things every week: where do we rank, what should we write next, and a report the client/boss can read. Today that means:

- **Ahrefs/Semrush at $129–$249+/mo per seat** — paying for a research suite when 80% of usage is checking positions and pulling a report.
- A separate AI tool (or raw ChatGPT) for content briefs, disconnected from ranking data.
- Manual report assembly in Google Slides every month.

The mid-market rank trackers (SERanking, Nightwatch, AccuRanker) track positions well but treat content planning as an afterthought, and their per-keyword pricing punishes exactly the agencies that need scale.

## Target User

- **Primary:** content/SEO agencies with 5–30 clients, and freelance SEO consultants — people who bill others for rankings and need white-label reporting.
- **Secondary:** in-house marketers at SMBs tracking 100–1,000 keywords.
- **Not targeting:** enterprise SEO (needs log-file analysis, crawl infra) or hobby bloggers (won't pay).

## Market & Profitability

- SEO tooling has some of the most **durable willingness to pay** in B2B software — rankings are tied directly to customer revenue, and tracking is a recurring need by definition.
- Realistic outcome: **$10k–$80k MRR**. The segment between "free Google Search Console" and "$249/mo Ahrefs" is wide and underserved for agencies.
- Agency economics make this sticky: the agency embeds RankRadar reports into *their* client deliverables — churn means changing their own client-facing process.
- Cost structure is transparent: SERP data via DataForSEO costs ~$0.0006–$0.003 per keyword check; a 1,000-keyword daily plan costs ~$20–$90/mo in data — priced at $99, margins hold at 60–75% and improve with weekly-check tiers.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Starter | $29/mo | 200 keywords (daily), 1 project, 5 AI briefs/mo |
| Agency | $59/mo | 1,000 keywords, 10 projects, white-label reports, 25 briefs/mo |
| Scale | $99/mo | 3,000 keywords, unlimited projects, API, 100 briefs/mo |

Brief overages sold as credit packs — content teams that love briefs are the expansion revenue.

## MVP Features

- [ ] Daily SERP position tracking (Google desktop + mobile, per-location) with history charts
- [ ] Competitor tracking: same keywords, up to 5 competitor domains, share-of-voice chart
- [ ] Keyword gap view: terms competitors rank for that you don't
- [ ] AI content briefs: from a target keyword → outline (H2/H3), entities to cover, questions to answer (PAA-derived), suggested internal links from your tracked pages, target word count
- [ ] Shareable client reports: hosted link + scheduled PDF email, white-label on Agency+
- [ ] Google Search Console connect (clicks/impressions alongside positions)
- [ ] Alerts: ranking drops >N positions, new page-1 entries

## Differentiation

1. **Briefs grounded in your data.** Competitor gap + live SERP features + your existing pages feed the brief — not a generic LLM outline. The brief is why they log in weekly, not just when rankings wobble.
2. **Agency-first packaging:** white-label hosted reports and per-project client access at $59 — features the big suites gate behind $200+ tiers.
3. **Honest per-keyword economics** — flat tiers, no per-keyword overage anxiety.

## Go-to-Market

- SEO practitioners are the easiest audience to reach with... SEO: programmatic comparison pages ("Nightwatch alternative", "rank tracker for agencies") + genuinely useful free tools (free SERP checker, brief generator lite) as top-of-funnel.
- Communities: r/SEO, r/bigseo, Traffic Think Tank, SEO Twitter/X — founders sharing build-in-public data does disproportionately well here.
- Partnerships: white-label reports make agencies natural affiliates (30% recurring).
- AppSumo-style LTD launch is an option for initial cash + feedback (with keyword caps to protect data costs).

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Ahrefs / Semrush | $129–$249+/mo | Priced and built for research suites, not tracking+reporting workflow |
| SERanking | $65+/mo | Briefs/content tools are add-on priced; UI aging |
| Nightwatch | $32+/mo | No content briefs, weak reporting |
| AccuRanker | $129+/mo | Tracking-only, enterprise pricing |

## Key Risks

- **Data-cost creep:** SERP API costs scale linearly with keywords × frequency. Mitigation: weekly-check option on lower tiers, batched location queries, strict per-plan caps.
- **Google SERP volatility:** layout changes (AI Overviews expansion) redefine "position." Mitigation: track SERP-feature presence explicitly and message it as a feature ("AI Overview visibility"), not a bug.
- **Incumbent bundling:** Semrush could bundle briefs cheaply. Counter is agency workflow depth + price, not feature breadth.
- **Churn when rankings are bad:** reports that show losses cause cancellations; the content-brief loop ("here's what to do about it") is the retention answer.
