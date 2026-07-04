# SchemaSentry Roadmap

## Phase 0 — Setup (Week 0, ~3-5 days)

Repo, infra, and the rule corpus so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Monorepo scaffolded (Fastify API + `src/core` engine + CLI + Next.js dashboard in one package); CI runs lint + typecheck + engine unit tests on every push
- [ ] Neon Postgres provisioned; Drizzle migrations working; Upstash Redis + BullMQ round-trip proven
- [ ] R2 bucket for raw spec originals; canonicalization (deref, sort, normalize) proven on 5 messy real-world specs
- [ ] GitHub App registered (check runs + PR comments in a sandbox repo); Slack app with a Block Kit hello-world alert
- [ ] npm package name claimed; `npx schemasentry --help` ships from CI
- [ ] Breaking-change rule corpus drafted: the taxonomy (30-50 rules across params, schemas, enums, required/nullable, status codes, content types) each with level, reason template, and fixture pair
- [ ] Benchmark set assembled: 40 real public API spec pairs (from public registries/history) with expert-labeled expected findings
- [ ] Stripe products for the three tiers; `.env.example` complete; Sentry wired

## Phase 1 — MVP (Weeks 1-8)

Goal: a team pushes specs from CI, gets trustworthy verdicts in PRs and Slack, and publishes a consumer-facing changelog.

- **Weeks 1-3: The engine.** Semantic diff walk (operations, params, request/response schemas, enums, flags, status codes, content types); rule matching -> findings with JSON-pointer paths and reason templates; policy overrides; verdict roll-up. Benchmarked against the labeled set continuously.
- **Week 4: CLI.** `diff` (offline, human + JSON output), `push`, `check` (exit codes, `--fail-on` levels); token auth; the GitHub Action wrapper.
- **Week 5: API + timeline.** Spec ingestion with canonicalization + spec-health report, deploy timeline, baseline management, diff-on-push jobs.
- **Week 6: Surfaces.** GitHub check runs + in-place PR comments; Slack alerts; the ack flow (hold-to-confirm + note, recorded in audit log, neutralizes per-PR).
- **Week 7: Consumers + contract tests.** Registry with declared usage, per-diff impact intersection, contract-suite generation (Vitest) with drift-aware regeneration.
- **Week 8: Changelog + billing.** Auto-drafted entries, editor, public SSG pages with RSS/email subscriptions; Stripe checkout + API-count gating; hardening (webhook DLQ review, load test at 100 pushes/min).

**Acceptance criteria:**

- [ ] Engine benchmark: ≥95% of expert-labeled breaking findings detected; **false-positive rate <2% on the labeled set** (CI trust is the product)
- [ ] `npx schemasentry diff old.yaml new.yaml` runs offline, no login, in <3s on a 2MB spec
- [ ] Push-to-Slack-alert latency <30s; PR check completes synchronously in <10s
- [ ] PR comment updates in place across force-pushes — never a second comment
- [ ] Policy override demoting a rule changes the verdict (fixture-proven); acks persist per-PR and appear in the timeline
- [ ] Consumer impact correctly names the consumer whose declared field was removed (fixture-proven)
- [ ] Generated contract suite runs green against the source deploy's mock and red against a breaking deploy
- [ ] Public changelog page publishes, subscribes (email + RSS), and renders breaking entries with migration notes
- [ ] Billing gates API count at push time with a clear upgrade path (no silent drops)
- [ ] 5 design-partner teams wired into real CI for 2+ weeks; ≥1 real breaking change caught before deploy per partner (or an honest writeup of why not)

## Phase 2 — Launch (Weeks 9-14)

Goal: public launch, first 30 paying teams, the OSS-core funnel running.

- Open-source the engine core (MIT): repo, docs, contribution guide; the CLI's free `diff` markets the hosted product in its output footer
- GitHub Marketplace listing for the Action
- Launch content: "We diffed 1,000 public APIs over a year" study (the receipts piece), Show HN, r/programming, API-design newsletters
- Comparison/SEO pages: "Optic alternative," "oasdiff vs SchemaSentry," "openapi diff ci," "api versioning without breaking clients"
- Onboarding polish: spec-health report with per-framework spec-generation guides; sample-repo playground
- Changelog-loop instrumentation: "Watched by SchemaSentry" footer -> signup attribution

**Acceptance criteria:**

- [ ] OSS core at ≥500 GitHub stars with ≥5 external contributors merged (funnel health, not vanity: star-to-signup rate measured)
- [ ] 30 paying teams; ≥8 on Team tier or above
- [ ] Self-serve proven: ≥15 teams reached a passing CI check with zero human help; median time-to-first-verdict <10 minutes
- [ ] The study piece: ≥50k unique readers, measured signup attribution ≥3%
- [ ] GitHub Marketplace: ≥100 Action installs
- [ ] Changelog pages live for ≥20 APIs; ≥2 signups attributed to the footer loop
- [ ] False-positive complaints <1/week across all customers; every one triaged into a rule fix or a documented disagreement

## Phase 3 — Growth (Months 4-12)

Goal: $15k+ MRR, traffic-shape mode, and the consumer-registry network effect.

- **Traffic-shape mode (Platform tier):** middleware capture (Express/Fastify/Django/Rails adapters) sampling request/response shapes with strict PII redaction; observed-vs-declared drift reports; the no-spec onboarding path
- Auto-suggested consumers: infer per-API-key usage from traffic mode to pre-fill the registry (suggested, never auto-published)
- Pact interop: import Pact contracts as declared usage; export findings as Pact-compatible verifications
- GraphQL diff engine (evaluate seriously against demand data — do not build by default)
- SDK-regeneration hooks: on compatible-but-notable changes, trigger customers' SDK pipelines via webhook
- Self-hosted/enterprise build (the Fastify+Postgres shape was chosen for this) with SSO/audit depth
- Content flywheel: quarterly "State of API Breakage" report from anonymized aggregate findings

**Acceptance criteria:**

- [ ] $15k MRR; logo churn <2%/month trailing 3 months; net revenue retention ≥105% (API-count expansion working)
- [ ] Traffic-shape mode in production for ≥10 Platform customers; zero PII incidents; drift report catches ≥1 real spec-reality divergence per customer in month one
- [ ] ≥30% of Team+ customers maintain ≥3 registered consumers (the registry is being used, not decorative)
- [ ] Pact import used by ≥5 customers
- [ ] ≥2 self-hosted/enterprise contracts signed or a documented decision to defer
- [ ] "State of API Breakage" report cited by ≥3 external newsletters/blogs (the taxonomy becoming the reference)
- [ ] Engine benchmark re-run each release; accuracy and false-positive numbers published in the changelog — including regressions, honestly
