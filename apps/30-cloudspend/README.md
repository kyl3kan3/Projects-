# CloudSpend

**Cloud cost monitoring for startups: know what you spend, get woken up when it spikes, and see exactly which deploy did it.**

---

## The Problem

Every startup has a cloud-bill horror story: the $8k weekend from a runaway Lambda loop, the forgotten GPU instance, the S3 egress surprise, the staging environment nobody turned off. AWS's native tools (Cost Explorer, Budgets) are built for finance teams doing month-end review — daily granularity, delayed data, alerts that arrive after the damage. The enterprise FinOps suites (CloudHealth, Cloudability, Vantage's upper tiers) are priced as a % of cloud spend and sold to companies with dedicated FinOps staff.

The 5–50-person engineering team in between has a simple need: near-real-time visibility, anomaly alerts in Slack *before* the bill compounds, and cost attribution an engineer can act on ("this spike started with Tuesday's deploy of service X").

## Target User

- **Primary:** engineering leads/CTOs at seed-to-Series-B startups spending $2k–$100k/mo on AWS (expand to GCP later) with no FinOps function.
- **Secondary:** agencies/consultancies managing multiple client AWS accounts; indie hackers with usage-billed infra.
- **Not targeting:** enterprise FinOps (chargeback, amortization accounting, reserved-instance portfolio management).

## Market & Profitability

- The pain is universal, recurring, and quantifiable — the product literally finds money. Vantage's rise proved the modern-UX segment; its pricing (% of spend at higher tiers) re-opens the flat-price flank.
- Realistic outcome: **$10k–$70k MRR.** B2B, high ACV for micro-SaaS ($49–$199/mo), and near-zero churn once wired into Slack rituals — cost visibility becomes part of the team's operating cadence.
- One prevented incident pays for years of the product; the ROI story sells itself in the first anomaly alert.
- Costs are modest: Cost Explorer API polling + Postgres; margins 85–90%.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Solo | $49/mo | 1 AWS account, daily digest + anomaly alerts |
| Startup | $99/mo | 5 accounts, hourly granularity, deploy-correlation, budgets per service/team |
| Scale | $199/mo | 15 accounts, GCP, API, custom alert rules, SSO |

Flat pricing — never a % of spend (the positioning line against enterprise FinOps).

## MVP Features

- [ ] Read-only AWS connect via CloudFormation-launched IAM role (least privilege, auditable — the 5-minute onboarding)
- [ ] Cost ingestion: Cost Explorer API + CUR (Cost & Usage Report) parsing for depth, normalized per service/region/account/tag
- [ ] **Anomaly detection with Slack alerts:** baseline per service (seasonality-aware), alert on deviations with dollar impact and the offending service/resource ("EC2 in us-east-1 is trending +$340/day vs baseline")
- [ ] Daily/weekly Slack digest: spend so far, forecast vs last month, top movers
- [ ] Deploy correlation: webhook/GitHub integration marks deploys on the cost timeline ("spike began 2h after deploy abc123 of api-server")
- [ ] Budgets per service/tag/team with burn-rate projection alerts
- [ ] Waste report: idle instances, unattached volumes, old snapshots, over-provisioned resources (top 10, dollar-ranked)

## Differentiation

1. **Engineer-first, Slack-native:** alerts an engineer can act on (resource + probable cause + deploy correlation) versus finance-first dashboards. The deploy-correlation timeline is the feature competitors skip.
2. **Flat pricing** — "we don't take a percentage of your bill" is a one-line wedge against the FinOps suites' model.
3. **5-minute least-privilege onboarding** — the CloudFormation one-click with a readable IAM policy converts the security-conscious.

## Go-to-Market

- Engineering-audience channels: Show HN (cost horror stories are HN's favorite genre), r/aws, r/devops, CTO newsletters (Pragmatic Engineer-class placements later).
- Content: the "AWS bill horror story + how to catch it in 2 hours" post genre writes itself and ranks; open-source a small IAM-policy auditor as top-of-funnel.
- Free "cloud-bill roast": connect read-only, get a one-time waste report — converts to monitoring.
- YC/accelerator communities (startup deals lists), AWS Activate ecosystem adjacency.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| AWS Cost Explorer/Budgets | Free | Delayed, coarse, no deploy context, alerts after the fact |
| Vantage | Free tier → % of spend tiers | Percentage pricing at scale; broadening beyond the simple need |
| CloudZero / Cloudability | Enterprise | Priced/sold past the startup segment |
| Datadog Cloud Cost | Add-on | Requires Datadog; expensive combo |

## Key Risks

- **Data-latency reality:** AWS cost data lags hours (Cost Explorer ~24h, CUR ~8–24h); "near-real-time" must be honestly framed (CloudWatch billing metrics + usage-proxy signals for the fast path, CUR for accuracy). Overpromising here kills trust.
- **AWS could ship this:** they structurally won't do Slack-native, deploy-correlated, multi-account startup UX well — but track it; speed and focus are the defense.
- **Security scrutiny:** read-only billing access is still access; SOC 2 becomes necessary earlier than for most micro-SaaS — budget for it in year 1.
- **Spend-based seasonality:** customers optimize and their perceived need dips; the digest ritual + waste reports keep the product valuable in calm months.
