# PulseWatch

**Uptime, cron-job, and SSL/domain-expiry monitoring with public status pages — priced and built for indie devs and small teams.**

## The Problem

Monitoring for small operators is in a weird place:

- **UptimeRobot** owned this niche for a decade, but the free tier has been steadily degraded: 5-minute check intervals, upsell banners everywhere, status pages plastered with ads, and features (SSL monitoring, multi-region confirmation) walled off. It feels like abandonware being milked.
- **BetterStack** is genuinely excellent software — for a platform team with budget. It bundles logs, incident management, and on-call scheduling you don't need, and the pricing reflects that. An indie dev with 12 side projects does not want to think about "responders" and "escalation policies."
- **Cron monitoring is an afterthought everywhere.** Most uptime tools bolt heartbeats on as a checkbox feature, if at all. Yet for anyone running scheduled jobs — nightly backups, billing crons, queue reapers — a silently dead cron is *more* dangerous than a down website, because nothing looks broken until data is lost. Healthchecks.io does this well but does *only* this, so you end up paying for and configuring two tools.

The result: indie devs either run degraded free tiers across three services, self-host something they then have to monitor (who watches the watcher?), or simply don't monitor their crons at all.

## Target User

- **Indie hackers** running 3–30 small products on Vercel, Fly, Railway, and a VPS or two.
- **Freelancers and small agencies** who need to monitor client sites and want a white-label-ish status page to show clients.
- **Side-project operators** with a day job — they need alerting that works while they're not looking, not a NOC dashboard.
- **Small teams (2–10 devs)** who outgrew a free tier but choke on BetterStack's per-seat/per-feature pricing.

Common thread: they will spend 10 minutes setting this up, then never open the dashboard again unless something breaks. The product must respect that.

## Market & Profitability

Realistic framing, no hype:

- Indie-focused monitoring products validate in the **$5k–$20k MRR** range (public build-in-public numbers from this niche, e.g. Pulsetic and similar tools, cluster here). This is a solid solo-founder or two-person business, not a venture outcome.
- **It's a volume game at a low price point.** At a $12 blended ARPU, $10k MRR means roughly 800 paying customers. The free tier is the acquisition engine; conversion of 2–5% of free users is the realistic path, so you need tens of thousands of free signups over time. GTM matters more than features after MVP.
- **Marginal cost per monitor is near zero.** An HTTP check is a few KB of traffic and a database row. The probe fleet is a fixed cost that a single customer or ten thousand customers share almost equally (see ARCHITECTURE.md cost model). Gross margins land at 85–90%+ once the fixed probe fleet is amortized.
- **Churn is structurally low.** Monitoring is set-and-forget: once monitors and alert channels are configured, the switching cost is real annoyance for zero gain. Sub-3% monthly churn is achievable, which makes the volume math workable.
- **Ceiling is real.** The buyers who'd pay $99+/mo want SSO, compliance, on-call — that's BetterStack's turf. Don't chase them; the plan tops out at $19 on purpose.

## Monetization & Pricing

| | **Free** | **Solo — $9/mo** | **Team — $19/mo** |
|---|---|---|---|
| Monitors | 3 | 25 | 100 |
| Check interval | 5 min | 1 min | 1 min |
| Cron heartbeats | Included in monitor count | Included | Included |
| SSL + domain expiry | Yes | Yes | Yes |
| Regions per check | 1 | 3 | 3 |
| Status pages | 1 (pulsewatch.dev subdomain) | 3 | 10 |
| Status page custom domain | — | — | Yes |
| Alert channels | Email, webhook | + Slack, Discord | + SMS |
| SMS credits | — | — | 100/mo |
| Team members | 1 | 1 | 10 |
| History retention | 30 days | 1 year | 2 years |

Annual billing at 2 months free. No per-seat pricing anywhere — seats are a Team-tier feature, not a meter. The free tier is deliberately generous (real 5-min checks, real status page, no ads) because free users' status pages and "monitored by PulseWatch" badges are the marketing.

## MVP Feature List

- [ ] HTTP(S) checks: status code, response time, keyword match, follow redirects, custom headers
- [ ] Cron heartbeats: unique ping URL per job, grace periods, expected schedule/interval, missed-ping alerting
- [ ] SSL certificate expiry monitoring (alert at 30/14/7/1 days)
- [ ] Domain (WHOIS) expiry monitoring
- [ ] Public status pages: uptime bars (90 days), incident history, manual incident posting, subdomain per account
- [ ] Alerting: email, Slack webhook, Discord webhook, generic webhook (JSON POST)
- [ ] Incident lifecycle: open after N consecutive failures, auto-resolve on recovery, alert on both edges
- [ ] Stripe billing with the three tiers above
- [ ] Team accounts (single owner at MVP; invites can slip to Phase 3)

Post-MVP (explicitly not in MVP): SMS alerts (Twilio), multi-region check confirmation, TCP/port and ICMP ping checks, public API, status badges, maintenance windows.

## Differentiation

1. **Dead simple.** One product, one page to add a monitor, sane defaults. No "playbooks," no on-call calendars. Time-to-first-monitor under 60 seconds.
2. **Cron monitoring is first-class, not a bolt-on.** Heartbeats live beside HTTP monitors in the same list, same incidents, same status page rows. This is the wedge: "the uptime tool that also actually watches your crons."
3. **A free tier you'd actually use.** 3 monitors with real features and no ads — the anti-UptimeRobot position.
4. **Indie pricing.** $9 covers a serious indie portfolio; $19 covers a small agency. Nothing gated behind "contact sales."

## Go-to-Market

Specific channels, in priority order:

1. **Show HN** — monitoring tools do reliably well on HN when the pitch is concrete ("generous free tier, cron heartbeats included"). Prepare for the "why not Healthchecks.io/self-host" thread; answer honestly.
2. **Comparison/alternative SEO pages** — the highest-intent traffic in this niche: "UptimeRobot alternative", "Better Uptime alternative", "cron job monitoring", "Healthchecks.io vs Cronitor". These pages compound; write them before launch, not after.
3. **Free tools as lead magnets** — a public SSL checker (`pulsewatch.dev/tools/ssl-checker`), a cron expression explainer, a "is my site down" checker. Each ranks on its own and funnels to signup. Near-zero cost to run since the probe infra already exists.
4. **Reddit** — r/selfhosted (be honest: "yes you can self-host Uptime Kuma; here's when you shouldn't watch your own watcher"), r/webdev, r/indiehackers (build-in-public MRR posts work in this exact niche).
5. **Product Hunt** — one coordinated launch, mostly for backlinks and the badge; don't over-invest.
6. **Dev newsletter sponsorships** — TLDR, Bytes, Console at ~$500–2k per slot; test after there's baseline conversion data, not before.
7. **"Monitored by PulseWatch" footer on free-tier status pages** — the long-term compounding channel (opt-out on paid).

## Competition

| Competitor | Pricing | Weakness to exploit |
|---|---|---|
| **UptimeRobot** | Free (5-min, ads, degraded); ~$8+/mo paid | Stagnant product, ad-laden free tier, cron monitoring an afterthought, dated UX |
| **BetterStack (Uptime)** | Free tier limited; ~$29+/mo, scales fast with features/seats | Enterprise-shaped: complex, bundled with logs/on-call, priced for teams with budget |
| **Cronitor** | Free (5 monitors); ~$49/mo for teams | Cron-first but uptime side is weaker; team pricing jumps steeply past indie budgets |
| **Healthchecks.io** | Free (20 checks); $20/mo | Cron-only — no uptime/HTTP checks, no status pages; excellent but half a product |
| **StatusCake** | Free (10 monitors, slow intervals); ~$25+/mo | Cluttered upsell-heavy UX, aggressive marketing emails, aging product |
| **Pulsetic** | ~$10–83/mo, no meaningful free tier | Closest analogue (indie uptime); weak/absent cron monitoring, limited free tier |
| *(Self-host: Uptime Kuma)* | Free (OSS) | You must host and monitor it yourself; no SMS/email infra; no accountability when your VPS dies |

## Key Risks

- **Race to the bottom.** Everyone in this niche competes on price; there is always a cheaper tool or a free OSS option. Mitigation: compete on trust and taste, not on being cheapest — and keep costs so low that $9 is durable.
- **Free-tier abuse.** Monitoring free tiers attract people pointing checks at sites they don't own (scraping-adjacent), heartbeat spam, and status-page phishing. Mitigations: verify-before-high-frequency, per-account rate limits, abuse heuristics on ping ingest, no HTML injection on status pages.
- **Incumbents with free tiers.** UptimeRobot/StatusCake can absorb "free" positioning forever. The wedge must be product quality + cron-first, not free-tier arithmetic alone.
- **Winner-take-most on trust — the monitor must not go down.** One false "your site is down at 3am" page, or worse, one missed real outage, and the customer leaves forever. This is the existential risk. It dictates architecture: multi-region confirmation before alerting, an independent watchdog monitoring PulseWatch itself (eat elsewhere's dogfood: use a competitor to watch PulseWatch), status page hosted on separate infrastructure from the dashboard, and boring, redundant infra choices throughout.
- **Solo-founder bus factor on an always-on product.** Paging yourself forever is the real cost of running a monitoring company. Keep the system self-healing (queue retries, region failover) so a bad day doesn't require heroics.

## Repository Layout

Single-package monorepo-style layout: the Next.js dashboard, the probe worker, and the scheduler share one `package.json` and one `src/` tree. See `ARCHITECTURE.md` for rationale, data model, and cost model; `ROADMAP.md` for the build plan.

```
src/
  app/         Next.js App Router (dashboard, status pages, API routes)
  db/          Drizzle schema + migrations
  lib/         Shared domain logic (monitors, incidents, alerts)
  probe/       Probe worker entrypoint + check implementations
  scheduler/   Check scheduler (enqueues due work onto Redis)
```

Status: scaffold only. No implemented business logic yet.
