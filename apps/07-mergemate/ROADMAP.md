# MergeMate Roadmap

Realistic solo/duo pace. Week counts are elapsed calendar weeks assuming this is the main project.

## Phase 0 — Setup (Week 0, ~3-5 days)

Scope:
- Register the GitHub App (dev instance): permissions (pull requests: read/write, contents: read, checks: write, members: read), webhook events (pull_request, push, issue_comment, pull_request_review_comment, marketplace_purchase, installation), generate private key.
- Provision Neon Postgres, Upstash Redis, Anthropic API key, Sentry project.
- Repo bootstrapped from this scaffold: TypeScript strict, vitest, lint, CI running test + typecheck on every push.
- Drizzle schema compiles; initial migration generated and applied to the dev database.
- Probot app runs locally, receives webhooks via a tunnel (smee.io), logs a structured event for a PR opened in a sandbox repo.

Acceptance criteria:
- Opening a PR in the sandbox repo produces a logged, parsed webhook event locally within 5 seconds.
- `npm run db:migrate` is idempotent against a fresh database.
- CI is green on the empty-logic skeleton.

## Phase 1 — MVP (Weeks 1-6, ~5-7 weeks)

Scope (maps to the README MVP checklist):
- Week 1-2: review pipeline spine. Webhook -> BullMQ job -> worker -> diff fetch with context expansion -> single Claude analysis pass -> findings persisted. No posting yet (shadow mode is the default build order, conveniently also an onboarding feature).
- Week 2-3: posting. Inline comments anchored to diff lines, suggestion blocks for mechanical fixes, one summary comment updated in place across pushes. Idempotency on redelivered webhooks.
- Week 3-4: rulebook. .mergemate.yml parse + zod validation, immutable versioning on default-branch pushes, failing check on invalid rulebook, findings tagged with rule id + version. Starter templates for TypeScript, Python, Go.
- Week 4-5: low-noise machinery. Confidence scoring pass, post threshold, per-PR comment cap, suppression memory via thumbs-down reaction and "mergemate ignore" reply, feedback_events capture.
- Week 5-6: hardening. Golden set (>= 50 labeled PRs: real bugs, security cases, standards violations, clean PRs, and prompt-injection red-team cases), incremental re-review on synchronize, cost telemetry per run, per-installation queue concurrency and rate limits.

Acceptance criteria:
- Reviews a 500-changed-line PR in under 3 minutes end-to-end (webhook receipt to comments posted), p95 under 5 minutes.
- False-positive rate under 15% on the golden set at the default threshold (posted findings judged wrong by the labeled answer key); target under 10% before launch.
- Median posted comments per PR across the golden set: 3 or fewer; zero comments on the clean-PR subset in at least 8 of 10 cases.
- A thumbs-down on a finding results in zero recurrence of that fingerprint across 20 subsequent golden-set runs on the same repo.
- Editing .mergemate.yml on the default branch activates a new version within 60 seconds; an invalid edit produces a failing check and reviews continue on the previous version.
- All prompt-injection red-team cases in the golden set fail to produce out-of-schema output or comment content that executes instructions from the diff.
- Cost per review is recorded on every run; average over the golden set is at or under $0.10.

## Phase 2 — Launch (Weeks 7-10)

Scope:
- Billing: GitHub Marketplace listing draft, plan/seat sync webhooks, free-for-OSS gating, Stripe fallback checkout. Note: Marketplace listing requires GitHub's review process (verified publisher requirements, app security review, listing content review). Budget 2-4 weeks of calendar time for approval; start the submission at the top of this phase so it overlaps the rest.
- Dashboard v1 (Next.js): install list, rulebook viewer with version history, findings/noise stats (posted vs gated counts, feedback ratios), shadow-mode toggle.
- Marketing site: landing page with the low-noise positioning, pricing page, two comparison pages (CodeRabbit alternative, Copilot code review comparison), docs for .mergemate.yml.
- Launch motions: Show HN post, GitHub Marketplace listing live, first newsletter sponsorship booked, "Reviewed by MergeMate" badge line active on OSS reviews.
- Ops: Sentry alerting, dead-letter queue review runbook, uptime monitoring on the webhook endpoint.

Acceptance criteria:
- Marketplace listing approved and installable with a paid plan; a test purchase provisions seats and a cancellation downgrades at period end without manual intervention.
- A stranger can go from Marketplace install to first review comment in under 10 minutes with no support contact (tested with 5 outside beta users).
- 20+ OSS repos actively reviewed; 5+ private-repo teams on paid or trial.
- Webhook endpoint 99.9% ack success over the final 2 launch weeks; no review job lost (dead-letter queue drained to zero weekly).
- Published a public precision report from the golden set (methodology + numbers) linked from the landing page.

## Phase 3 — Growth (Months 3-6)

Scope:
- Business tier completion: SSO (SAML/OIDC), org-wide suppression sharing, tunable confidence threshold, priority queue lane, 1-year audit log.
- Precision flywheel: per-repo threshold auto-tuning from feedback_events; quarterly golden-set refresh and published precision report.
- Rulebook depth: natural-language custom rules compiled to structured checks, rule packs per ecosystem (Django, Rails, React), import from existing lint configs.
- Cost engineering: prompt caching everywhere, incremental context strategies, model routing (cheaper model for the confidence pass) with golden-set gates so quality never regresses silently.
- GTM scale-up: remaining comparison SEO pages, 2-3 newsletter placements per month with per-placement install tracking, community presence in 3-5 devtools Discords, case study from a design-partner team.

Acceptance criteria:
- $10k MRR (the bottom of the realistic band from README.md) with gross margin at or above 85%.
- Logo churn under 5%/month over a trailing quarter; uninstall-within-14-days rate under 20% of new installs.
- False-positive rate under 10% on the refreshed golden set with the auto-tuned thresholds.
- At least 30% of new paid installs attributable to the OSS badge or comparison pages (UTM/referrer tracked).
- Median time-to-first-review across all installs under 3 minutes at 10x Phase 2 PR volume.
