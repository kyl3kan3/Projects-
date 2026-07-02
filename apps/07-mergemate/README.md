# MergeMate

AI code review for GitHub that only speaks when it is confident: a low-noise reviewer that learns your team's rulebook, posts inline suggested patches, and never repeats a nit you have dismissed.

## The Problem

Two failure modes dominate code review today, and they compound each other.

**Review latency.** In 5-50 person engineering teams, PRs routinely sit for 4-24 hours waiting for a human reviewer. Every hour of wait time is context-switching tax: the author moves on, the reviewer batches, the rebase conflicts pile up. Teams consistently report review latency as a top-three delivery bottleneck, and the smallest teams feel it worst because there is no slack in the reviewer pool. OSS maintainers have the same problem at a different scale: a queue of drive-by PRs from strangers, each requiring a full trust-nothing read before merging.

**Noisy AI reviewers get uninstalled.** The first generation of AI review tools answered latency with volume: 15-30 comments per PR, most of them stylistic, speculative, or wrong. The result is alert fatigue. Developers learn to scroll past the bot, then mute it, then uninstall it. An AI reviewer whose comments are ignored is worse than none at all, because it trains the team to ignore review comments generally. The evidence is visible in public complaint threads about every major tool in the category: the number one reason for churn is not missed bugs, it is noise.

The unmet need is precision. A reviewer that posts three comments per PR that are almost always right beats one that posts twenty comments that are sometimes right.

## Target User

- **Primary: engineering teams of 5-50 developers.** Big enough that review latency hurts, small enough that they cannot dedicate senior engineers to review duty. They have informal conventions ("we never use raw SQL here", "all handlers must validate input with zod") that live in tribal knowledge and get re-litigated in every PR.
- **Secondary: OSS maintainers** triaging drive-by PRs. They need a first-pass filter that catches bugs and standards violations before they spend personal time on a stranger's patch. Free tier serves them; they serve us as distribution (see Go-to-Market).

Anti-target: enterprises above ~200 engineers with platform teams and bespoke review tooling. They negotiate custom contracts we are not staffed to serve at this stage.

## Market & Profitability

The AI PR reviewer category is validated and crowded, which is both the risk and the proof.

- CodeRabbit has publicly claimed thousands of paying customers; Greptile raised on strong revenue traction; GitHub is bundling Copilot code review into paid Copilot plans.
- Multiple indie players in this exact category have reported sustainable revenue in the **$10k-$50k MRR** range. That is the realistic ceiling to plan around for a solo/duo team, not a venture-scale outcome.
- At $12/dev/month, $25k MRR requires roughly 2,100 paid seats, i.e. about 100-150 team accounts of typical size. That is an attainable multi-year goal for a well-differentiated product with a working OSS flywheel; it is not a first-year expectation.
- Unit economics work if and only if LLM cost per PR stays well under seat price. See ARCHITECTURE.md for the per-PR cost model; the short version is that an average PR costs $0.03-0.10 in Claude API tokens, so a developer must open more than ~120 PRs/month before a $12 seat goes underwater. Typical is 10-20.

We do not assume we out-model the competition. We assume we out-position them on trust: predictable, auditable, quiet.

## Monetization & Pricing

| | Free (OSS) | Team - $12/dev/mo | Business - $20/dev/mo |
|---|---|---|---|
| Price | $0 for public repos | $12 per developer/month | $20 per developer/month |
| Repos | Public only | Private + public | Private + public |
| PR reviews | Unlimited, standard queue | Unlimited | Unlimited, priority queue |
| Low-noise confidence gating | Yes | Yes | Yes, tunable threshold |
| .mergemate.yml rulebook | Yes | Yes | Yes |
| Custom rules (natural-language + pattern) | Starter set only | 25 custom rules | Unlimited custom rules |
| Suppression memory | Yes | Yes | Yes, org-wide sharing |
| Suggested patches (GitHub suggestion blocks) | Yes | Yes | Yes |
| Dashboard analytics | Basic | Full | Full + exports |
| SSO (SAML/OIDC) | - | - | Yes |
| Audit log | - | 30 days | 1 year |
| Support | Community | Email, 2 business days | Priority, 1 business day |

Billing via GitHub Marketplace (primary; 5% fee, zero checkout friction) with Stripe as fallback for orgs that cannot buy through Marketplace. Seats are counted as unique PR authors in a billing period, so dormant accounts are free.

## MVP Feature List

- [ ] GitHub App installation flow (Probot) with org and repo selection
- [ ] Webhook handling for pull_request opened/synchronize/reopened
- [ ] Diff ingestion with context expansion (surrounding code, changed file contents)
- [ ] Claude-powered analysis pass: bugs, security issues, standards violations
- [ ] Confidence scoring on every finding, with a hard post threshold (low-noise gate)
- [ ] Inline PR comments anchored to the correct diff line
- [ ] Suggested patches using GitHub suggestion blocks where a safe fix exists
- [ ] .mergemate.yml rulebook: parse, validate, version on every change
- [ ] Rulebook starter templates (TypeScript, Python, Go)
- [ ] Suppression memory: thumbs-down reaction or "mergemate ignore" reply suppresses that finding fingerprint permanently
- [ ] Feedback capture: thumbs-up/down on comments recorded as training signal for threshold tuning
- [ ] Review summary comment (one per PR, updated in place, never a new comment per push)
- [ ] BullMQ job queue with per-installation concurrency limits and retry
- [ ] Free-for-OSS gating (public repo = free, private repo requires plan)
- [ ] GitHub Marketplace listing with plan sync webhooks
- [ ] Minimal dashboard: installations, rulebook viewer, findings history, noise stats
- [ ] Golden-set evaluation harness: fixed corpus of PRs with labeled findings, measured false-positive rate per release

## Differentiation

Everyone in this category claims "AI code review." Our wedge is a specific stance: **the reviewer should be quiet, predictable, and auditable.**

1. **Low-noise confidence gating.** Every candidate finding gets a confidence score from a dedicated scoring pass. Findings below the threshold are stored (visible in the dashboard) but never posted to the PR. We publish our target: median 0-3 comments per PR. Silence is a feature; the bot saying nothing is a signal the PR is clean, not that the bot is broken.
2. **Versioned rulebook the team controls.** Standards enforcement is driven by .mergemate.yml, reviewed and merged like any other code. Every change creates a new immutable rulebook version, and every finding records which version produced it. When the bot flags something, the team can point at the exact rule and the exact version that fired. Reviews become predictable and auditable rather than chatty and mysterious.
3. **Suppression memory.** The same nit is never repeated. Dismiss a finding once (reaction or reply) and its fingerprint is suppressed for that repo, or org-wide on Business. Competitors re-litigate the same style opinion on every PR; we treat a dismissal as a permanent instruction.
4. **Suggested patches, not essays.** Where a fix is mechanical, we post a GitHub suggestion block the author can apply in one click. Comment length is capped; findings must state the defect, the evidence, and the fix.

## Go-to-Market

1. **GitHub Marketplace listing** as the primary storefront: category search traffic, one-click install, billing built in. Invest in listing screenshots showing a quiet review (3 comments) next to a competitor-style noisy one.
2. **Free-for-OSS as the distribution flywheel.** Public repos ride free forever. Every review comment on a public PR carries a small "Reviewed by MergeMate" badge line, visible to every contributor and drive-by reader of that repo. OSS usage is the ad; private-repo teams are the revenue.
3. **Show HN launch** with the low-noise angle as the headline ("An AI code reviewer that shuts up"). The noise complaint is well-known on HN; lead with the contrarian stance and real numbers from the golden set.
4. **Dev newsletter sponsorships**: TLDR, Bytes, JavaScript Weekly, Pointer. Small, targeted buys ($500-2,000 per placement) measured by installs, not impressions.
5. **Comparison SEO pages**: "CodeRabbit alternative", "Greptile vs MergeMate", "Copilot code review vs MergeMate". Honest feature tables; the low-noise stance and rulebook auditability are the recurring differentiators. These pages compound and intercept high-intent switchers.
6. **DevTools communities**: relevant Discords/Slacks (devtools-focused, Probot/GitHub Apps, language communities), engaging with review-pain threads rather than broadcasting.
7. **Content**: publish the golden-set methodology and false-positive numbers each quarter. Nobody else in the category publishes precision metrics; being the tool that measures itself builds trust with skeptical senior engineers, who are the actual buyers.

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|---|---|---|---|
| CodeRabbit | Free tier; ~$12-24/dev/mo paid | Category leader, polished, broad language support, chat with the bot | Widely criticized for comment volume/noise; opaque about why a finding fired; config is theirs, not yours |
| Greptile | ~$20-30/dev/mo | Deep codebase indexing, strong on cross-file context | Higher price; heavier setup; also chat-oriented rather than standards-oriented |
| GitHub Copilot code review | Bundled with Copilot ($19-39/user/mo tiers) | Zero-install distribution, native UX, GitHub's data advantage | Generic feedback, no team rulebook, no suppression memory; quality currently shallow; you cannot audit or tune it |
| Human-only review | Salary cost (effectively $50-100+ per review-hour) | Full context, mentorship value, trust | The latency bottleneck itself; inconsistent standards enforcement; does not scale with team growth |

Our position: we do not try to out-index Greptile or out-distribute GitHub. We win the teams who have tried a noisy reviewer, churned, and want one they can trust and control.

## Key Risks

1. **GitHub bundles Copilot code review for free.** The distribution giant giving away a good-enough version is the existential risk. Mitigation: differentiate on exactly what a bundled generic tool will not do — team-controlled rulebooks, suppression memory, auditability — and stay cheap enough that we are an add-on, not a rip-out decision.
2. **LLM cost per PR vs the $12 seat price.** A heavy team (large PRs, many pushes) can erode margin. Mitigation: incremental re-review on synchronize (only new commits), prompt caching, diff-size caps with graceful degradation, and per-seat PR soft limits on the Free/Team tiers. Cost telemetry per installation from day one.
3. **Prompt injection via PR content.** PR diffs, titles, and bodies are attacker-controlled input fed to an LLM with permission to post comments. Mitigation: strict output schema validation (findings JSON only, no free-form actions), no tool-use during analysis, content demarcation in prompts, never executing repo code, and red-team cases in the golden set.
4. **Trust cold-start.** Nobody believes "high accuracy" claims from a new tool, and the first bad comment costs the install. Mitigation: shadow mode (findings to dashboard only, no PR comments) as an onboarding default for skeptics; published golden-set metrics; conservative default threshold that loosens only with accumulated feedback.
5. **Category crowding compresses price.** If the floor drops toward $5/dev, margin depends entirely on LLM efficiency. Mitigation: keep infra lean (see cost model in ARCHITECTURE.md), and anchor value on the auditable-standards story, which is closer to compliance budget than tooling budget.

## Status

Pre-code scaffold. See ARCHITECTURE.md for system design and ROADMAP.md for the build plan.
