# SchemaSentry

**SchemaSentry is the breaking-change watchdog for your API: it diffs your OpenAPI spec (or observed traffic shapes) between deploys, fails the CI check and pings Slack when a change would break consumers, auto-generates contract tests, and publishes a changelog page your API consumers actually read.**

---

## The Problem

1. **Breaking changes ship by accident, constantly.** A renamed field, a tightened enum, a `required` flag added to a request property — none of these fail unit tests, all of them break someone's integration at 2am. The team finds out from a customer ticket, not from CI.
2. **Change communication is tribal.** Postman's 2025 State of the API report found teams communicate API changes primarily through team chat (75%) rather than documentation (42%), and 55% cite documentation gaps as a top collaboration problem. The consumer of your API — a partner, a customer, your own mobile team — learns about changes when something 500s.
3. **The spec and reality drift.** Many teams' OpenAPI file describes the API as designed, not as deployed. Handwritten specs rot; generated specs capture the code but not the intent. Nobody diffs either one release-over-release.
4. **Contract testing is a known fix nobody adopts.** Pact-style consumer-driven contracts work but demand that both sides buy into a workflow. The activation energy kills it outside big orgs. The 80% version — "tell me before I break the shape my consumers depend on" — has no default tool.
5. **The blast radius is expensive.** For platform companies, a broken partner integration is churn; for API-first products, it's the product being down. The cost asymmetry (one Slack alert vs. an incident + apology email) is enormous.

The job is narrow and automatable: know the API's shape at every deploy, diff shapes semantically (not textually), classify what breaks whom, block/alert accordingly, and keep the public changelog honest — all wired into CI in ten minutes.

## Target User

- **Primary:** platform/backend leads at API-first companies and B2B SaaS with public or partner APIs — 5-100 engineers, real external consumers, no dedicated API-governance function.
- **Secondary:** internal-platform teams shielding mobile/frontend consumers from backend churn; agencies maintaining client APIs.
- **Buyer profile:** an engineer with pager scars. Self-serve, CLI-first evaluation; pays with a team card. Sold by the first prevented incident.
- **Not a target (yet):** enterprises wanting full API-governance suites (linting standards boards, gateway policy), GraphQL-only shops (different diff engine, Phase 3 question), gRPC monorepos.

## Market & Profitability

- **Developer tooling is a fat-margin, high-WTP category.** SaaS gross margins cluster at 70-85% and dev tools sit at the top of that band — SchemaSentry's COGS is diffing JSON and sending webhooks. More importantly, willingness-to-pay anchors against incident cost: engineering leaders pay $99/mo without procurement for anything that plausibly prevents one integration outage a quarter.
- **The API surface keeps growing.** Postman's State of the API research puts APIs at the center of modern development (and now AI-agent consumption — machine consumers are even less tolerant of shape drift than human ones). Every new consumer type raises the cost of an unannounced breaking change.
- **Validated adjacency, open position.** Spec linting (Spectral), spec diffing (oasdiff, openapi-diff) exist as free libraries — proof of demand, no product wrapper: no deploy history, no consumer-facing changelog, no Slack/CI opinionation, no traffic-shape mode. Optic (the closest product) pivoted/faded; Akita/Postman Live Insights went enterprise-observability. "The CI check for API breakage" is unowned.
- **Realistic outcome: $10k-$80k MRR.** Bottom-up dev-tool motion: free CLI -> team plan on the first real save. B2B pricing, near-zero infra COGS, and retention driven by being wired into CI (rip-out cost is real once installed). Ceiling honesty: this is an excellent bootstrap business, not a venture story — unless the consumer-registry layer becomes the standard way APIs announce changes.

## Monetization & Pricing

Priced by **APIs watched** (a clean, self-expanding meter), flat per tier — never per-seat (the whole team should see alerts) and never per-request.

| Plan | Price | Includes |
|---|---|---|
| **Solo** | $49/mo | 1 API, CI check + Slack alerts, 90-day deploy history, public changelog page |
| **Team** | $99/mo | 5 APIs, contract-test generation, consumer registry + per-consumer impact, 1-year history, custom breaking-change policy |
| **Platform** | $199/mo | 15 APIs, traffic-shape mode (observed vs. declared drift), SSO, API access, audit log, priority support |

- **Free tier: the CLI is free forever** for local/one-shot diffs (`schemasentry diff old.yaml new.yaml`). The paid line is history, CI enforcement, alerts, and the hosted changelog — the team features.
- 14-day trial on all plans; annual = 2 months free.
- Expansion is structural: teams add APIs, then want traffic mode; the meter grows with their platform.

## MVP Feature List

- [ ] CLI (`schemasentry`): `diff` (two specs, human + JSON output), `check` (diff against the registered baseline, exit non-zero on breaking), `push` (record a deploy's spec) — free, no login required for local `diff`
- [ ] Semantic OpenAPI diff engine (3.0/3.1): request/response schemas, params, status codes, content types, enums, required-ness, nullability — classified as breaking / risky / compatible with human-readable reasons
- [ ] Breaking-change ruleset with per-API policy overrides (e.g. "additive enum values are breaking for us")
- [ ] GitHub Action + generic CI step: PR check with an inline summary comment (what breaks, for whom, why)
- [ ] Slack alerts on deploy-time breaking/risky changes, with the diff summary and affected endpoints
- [ ] Deploy timeline: every pushed spec versioned; any two deploys diffable in the dashboard
- [ ] Consumer registry: named consumers (partner X, mobile app) with the endpoints/fields they use (declared manually in v1); per-consumer impact analysis on every diff
- [ ] Contract-test generation: emit runnable test suites (Vitest/Jest + supertest style) asserting the shapes consumers depend on, regenerated as the spec evolves
- [ ] Hosted changelog page per API: human-readable, consumer-facing, auto-drafted from diffs (breaking changes highlighted, migration notes editable), subscribable via RSS/email
- [ ] Minimal Next.js dashboard: API list, deploy timeline, diff viewer, consumer impact, changelog editor
- [ ] Billing (Stripe) by API count; org/team auth

Post-MVP (explicitly cut from v1): traffic-shape mode (capture middleware/eBPF), GraphQL, Pact interop, gateway integrations (Kong/Envoy), auto-detected consumers from API-key analytics, SDK-regeneration hooks.

## Differentiation

1. **Deploy-history-first, not file-first.** Free libraries diff two files; SchemaSentry knows your API's shape at every deploy and answers "what changed since the version partner X integrated against?" That timeline is the product and the moat.
2. **Consumer-aware verdicts.** "Breaking" is relative to who consumes what. The registry turns a generic diff into "this breaks Acme's webhook handler (uses `order.status`, you removed `cancelled`)" — the alert an engineer forwards to their PM verbatim.
3. **The changelog page closes the loop.** Detection tools stop at the alert. Publishing the consumer-facing changelog (auto-drafted, human-edited) turns the compliance chore into the communication channel — and makes SchemaSentry visible to every consumer of the customer's API (a built-in distribution loop).
4. **Ten-minute adoption, one side only.** No consumer-side buy-in (unlike Pact), no gateway install, no traffic capture required for v1. A GitHub Action and a spec path.
5. **Honest classification.** Rule-based verdicts with citations to the exact JSON-pointer path and the OpenAPI semantics violated — reviewable, overridable per policy, never a black-box "AI says risky."

## Go-to-Market

1. **The free CLI as top-of-funnel:** `npx schemasentry diff` is immediately useful with zero signup; the output footer notes what the hosted check would have caught historically. Open-source the diff engine core (MIT) — the library others wrap becomes the funnel.
2. **Show HN / r/programming genre content:** "We diffed 1,000 public APIs' specs over a year — here's how often they broke consumers silently" (run against public spec registries; receipts included).
3. **GitHub Marketplace:** the Action listed where CI is configured; "add API breakage check" is a searchable intent.
4. **Postmortem-adjacent SEO:** "api breaking change checklist," "openapi diff ci," "how to version rest api without breaking clients" — engineers search these the week after an incident; weak incumbent content.
5. **The changelog loop:** every hosted changelog page footers "Watched by SchemaSentry" — the customer's consumers are the next customers (they run APIs too).
6. **Platform-engineering communities:** Platform Weekly, r/ExperiencedDevs, API-design newsletters; founder posts on breaking-change taxonomy (the ruleset as content).

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **oasdiff / openapi-diff (OSS libraries)** | Free | Excellent diff cores, zero product: no history, CI opinionation, consumers, alerts, or changelog. We wrap the same job with the workflow — and our own engine core is OSS too. |
| **Optic** | Faded/pivoted | Validated exactly this need (API diffs in CI), then lost focus. Its residual mindshare is a comparison-page opportunity ("Optic alternative"). |
| **Pact / PactFlow (SmartBear)** | Free OSS; PactFlow ~$100-500+/mo | The rigorous answer, but requires both producer and consumer to adopt the workflow; heavy for the 80% case. We interop later instead of competing on rigor. |
| **Spectral / Stoplight (SmartBear)** | Free / platform pricing | Linting and design governance, not deploy-over-deploy breakage; platform sale, not a 10-minute CI add. |
| **Postman ecosystem** | Free-enterprise | Owns API collaboration broadly; breaking-change CI enforcement is a buried checkbox, not a product. The giant validates the space; speed and single-purpose focus are the defense. |
| **Do-nothing / handwritten review** | Free | The real incumbent: PR reviewers eyeballing spec diffs. Works until it doesn't; our wedge content is exactly that failure mode. |

## Key Risks

1. **False positives kill CI trust fast.** A check that cries wolf gets `continue-on-error` within a week. Mitigation: conservative default ruleset, three-level verdicts (breaking/risky/compatible), per-API policy overrides, one-click "acknowledge + explain" that records intent instead of silencing the check.
2. **Spec quality garbage-in.** Teams with rotten or absent OpenAPI files get noisy or empty diffs. Mitigation: spec-health report on onboarding (honest "your spec won't support good diffs yet"), generated-spec guides per framework, and traffic-shape mode (Phase 3) as the no-spec path.
3. **Postman/SmartBear ships the checkbox.** Mitigation: the consumer registry + changelog loop are workflow depth a suite checkbox won't match; being MIT-core and CLI-first wins the practitioner default the way suites don't.
4. **Open-sourcing the engine cannibalizes paid.** Mitigation: deliberate — the engine was never the paid line; history, enforcement, consumers, and the hosted changelog are. (oasdiff already proves free diffing exists; we'd rather own the standard core.)
5. **Traffic-shape mode scope creep.** Observed-traffic inference is a different engineering universe (capture, sampling, PII). Mitigation: it stays Phase 3, behind the Platform tier, middleware-based (not eBPF) first, with a strict PII-redaction posture.
6. **Small-market gravity.** API-first teams that feel this pain acutely number in the tens of thousands, not millions. Mitigation: the meter (APIs watched) expands within accounts; the changelog loop recruits adjacent teams; costs stay near zero so patience is affordable.

## Sources

Market claims above are grounded in: Postman State of the API 2025 (change communication via team chat 75% vs. docs 42%; documentation gaps cited by 55%; 93% of teams reporting collaboration challenges; the rise of AI-agent API consumers) and standard SaaS gross-margin benchmarks (70-85%, with best-in-class ≥80%) for the dev-tool category economics.

---

## Setup

Node 20 or newer, and a Postgres database. Nothing else is required to run the
whole product locally.

```bash
npm install
cp .env.example .env.local          # then fill DATABASE_URL and JWT_SECRET
npm run db:migrate                  # creates the 16 tables
npm run dev                         # http://localhost:3042
```

Sign up, add an API, and create a CI token under **Account → CI tokens**. Then,
from the repository whose spec you want watched:

```bash
export SCHEMASENTRY_TOKEN=ss_…
export SCHEMASENTRY_API_URL=http://localhost:3042

npx schemasentry push openapi.yaml --api payments-api --version $GIT_SHA
```

The first push becomes the baseline. The second produces a verdict.

### The CLI

```bash
schemasentry diff old.yaml new.yaml     # free, offline, no account, always exits 0
schemasentry check spec.yaml --api payments-api --fail-on breaking
schemasentry push  spec.yaml --api payments-api --version $GIT_SHA
schemasentry apis                       # what this token can reach
```

`--json` on any command gives a stable machine-readable shape. `-V` prints the
CLI version (`--version` belongs to `push` and `check`, where it labels the
deploy).

### CI

With GitHub Actions, use the bundled composite action:

```yaml
# .github/workflows/schemasentry.yml
name: API contract
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    permissions: { pull-requests: write, checks: write }
    steps:
      - uses: actions/checkout@v4
      - uses: ./                       # or your-org/schemasentry@v1
        with:
          api: payments-api
          spec: openapi.yaml
          token: ${{ secrets.SCHEMASENTRY_TOKEN }}
          fail-on: breaking
```

On any other CI system the two `npx` commands above are the whole integration.
Set `GITHUB_TOKEN` on the server to get the check run and the single in-place PR
comment; without it the verdict and the exit code still work.

### Running the API as its own process

The `/v1` surface is served both as Next route handlers (`/api/v1/*`, which is
what Vercel deploys) and as a standalone Fastify server for self-hosting. Both
mount the same handlers from `src/lib/service.ts`.

```bash
npm run api        # Fastify on API_PORT, /v1/specs /v1/check /v1/apis /health
```

### Scheduled work

Alert delivery is a Postgres queue with backoff and a dead letter, drained inline
on push and again by a cron route:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3042/api/cron/tick
```

On Vercel, add it to `vercel.json` as a cron job. The route refuses to run when
`CRON_SECRET` is unset. When the Fastify process is running it drains the queue
itself every 15 seconds and no cron is needed.

### Checks

```bash
npm run typecheck
npm test           # node:test via tsx, no test dependency
npm run build
```

## Implementation notes

Three deliberate departures from `ARCHITECTURE.md`, all to fit the Vercel + Neon
deployment target rather than the Railway-plus-worker shape it assumes:

1. **No BullMQ or Redis.** Vercel has no always-on process to run a queue
   consumer. Retryable fan-out is `notification_deliveries`: a unique
   `dedupe_key`, an attempt counter, exponential backoff, and a dead letter after
   five attempts, claimed with `FOR UPDATE SKIP LOCKED` so two ticks cannot both
   deliver a row. Diffs run synchronously — the engine is JSON tree-walking and
   finishes a 2MB spec pair in well under a second.
2. **Raw spec originals live in `deploys.raw_spec`, not R2.** Specs are kilobytes
   of text, immutability is satisfied by never updating the column, and it
   removes a credential from the setup path.
3. **`$ref` resolution is local-only**, hand-written rather than
   `json-schema-ref-parser`. Fetching a URL named inside untrusted customer input
   from the ingest path is an SSRF hole, and the diff engine has no business
   making network calls. A remote `$ref` becomes a spec-health warning telling you
   to bundle the spec first.

Auth is email + password (scrypt + a signed JWT cookie). `ARCHITECTURE.md` names
GitHub OAuth as the primary sign-in and the `users.github_login` column is there
for it, but it cannot be exercised without a registered app, and shipping an
untested sign-in path is worse than shipping one fewer.
