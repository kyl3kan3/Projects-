# CloudSpend Roadmap

## Phase 0 — Setup (week 0)
- Next.js + Postgres + Redis running; CloudFormation quick-create template drafted
- Assume-role round trip works against a test AWS account

**Done when:** connect flow pulls yesterday's costs from Cost Explorer into partitioned facts.

## Phase 1 — MVP (weeks 1–6)
- Onboarding: quick-create link, external ID, backfill (3 months), connect-status UX
- Dashboard: spend now, forecast, per-service/region/tag breakdowns, movers
- Baseline engine + anomaly detection (sustained-deviation logic, noise-tested)
- Slack app: alerts with ack/resolve, daily digest
- Stripe flat tiers

**Done when:** 10 pilot startups connected; a seeded synthetic spike alerts within one ingestion cycle; false-positive rate <1 alert/account/week.

## Phase 2 — Launch (weeks 7–10)
- Deploy correlation (GitHub app + generic webhook); timeline markers in dashboard + alerts
- Waste analyzer v1 (idle instances, unattached EBS, old snapshots) + the free "bill roast" acquisition tool
- CUR ingestion for resource-level depth
- Launch: Show HN cost-horror post, r/aws, r/devops; alternative pages (Vantage flat-price angle)

**Done when:** 30 paying orgs; roast→paid conversion ≥10%; a real customer anomaly caught with deploy correlation (the case study).

## Phase 3 — Growth (months 3–9)
- Multi-account org views; budgets per team/tag with burn alerts
- GCP support; API + custom alert rules (Scale tier)
- SOC 2 Type I; annual plans
- Savings recommendations v2 (rightsizing with utilization evidence)

**Done when:** $10k MRR; logo churn <3%/mo; ≥50% of alerts acked in Slack (ritual adoption metric).
