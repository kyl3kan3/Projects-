/**
 * The landing page, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture, written before the markup:
 *
 *   Enemy       the AI reviewer that posted twenty comments, was muted, then
 *               uninstalled — and the twelve-hour wait for a human that made a team
 *               install it in the first place.
 *   Sentence    "An AI reviewer that shuts up is the only kind you'll keep."
 *   Device      the restraint number: comments per pull request.
 *   Arc         hook (the product running) → tension (noise) → proof (our own
 *               numbers, labelled) → offer (free for OSS).
 *
 * On receipts: every number on this page comes from `npm run eval` on the corpus in
 * src/eval/corpus.ts, and says so, including that the corpus is synthetic and that
 * the run used the deterministic fallback rather than Claude. There are no
 * testimonials, no logos and no usage numbers, because MergeMate is pre-launch and
 * inventing them is a trust debt that never gets paid off.
 */

import { esc } from "./layout";
import { icon } from "./icons";

/** Numbers measured by the golden set, and where they came from. */
export interface Receipts {
  cases: number;
  cleanSilent: number;
  cleanCases: number;
  postedFindings: number;
  falsePositiveRate: number;
  commentsPerPr: number;
  model: string;
  usingFakeModel: boolean;
}

const CTA = "Install MergeMate";

/** The staged demo: a real rendering of what a review looks like on a PR. */
function demo(): string {
  return `<div class="panel demo">
  <div class="demo-head">
    ${icon("merge-node", 18)}
    <span class="t-data">northbeam/checkout&nbsp;#482 · fix: session refresh race</span>
  </div>
  <div class="pad-16">
    <p class="t-data m-0 mb-12">MergeMate reviewed 214 changed lines and said this:</p>
    <article class="finding r-control">
      <div class="finding-head">
        <span class="chip">src/auth/session.ts:112</span>
        <span class="chip chip-cat security">security</span>
        <span class="chip">no-raw-sql</span>
      </div>
      <span class="meter" role="img" aria-label="confidence 0.94, clears the gate">
        <span class="meter-track"><span class="seg on"></span><span class="seg on"></span><span class="seg on"></span><span class="seg on"></span><span class="seg on last"></span></span>
        <span class="meter-value">0.94</span>
      </span>
      <p class="t-title">Interpolated value inside a SQL string</p>
      <p class="t-sec">Any value reaching that <code>\${…}</code> is concatenated into the statement, so a caller controls the query text. Pass it as a bound parameter instead.</p>
      <pre class="well"><code><span class="diff-del">- const rows = await sql\`select * from sessions where token_hash = \${hashed}\`;</span>
<span class="diff-add">+ const rows = await db.query(SESSION_BY_HASH, [hashed]);</span></code></pre>
    </article>
    <div class="rows mt-16 no-top-border">
      <div class="row h-44 no-bottom-border">
        <span class="flex-none">${icon("gauge", 18)}</span>
        <span class="grow"><span class="t-sec">Three more candidates scored 0.55, 0.41 and 0.38. None were posted.</span></span>
      </div>
    </div>
  </div>
</div>`;
}

export function landingPage(receipts: Receipts): string {
  const fpRate = `${(receipts.falsePositiveRate * 100).toFixed(0)}%`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0D1117">
<title>MergeMate — the AI code reviewer that shuts up</title>
<meta name="description" content="Low-noise AI code review for GitHub. Every finding is confidence-scored, and anything under the bar is never posted. Free forever for public repositories.">
<link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
</head>
<body>
<header class="topbar">
  <span class="brand">${icon("merge-node", 22)}<span>MergeMate</span></span>
  <a class="t-sec" href="/login">Sign in</a>
</header>

<main class="wrap">
  <section class="mt-32">
    <h1 class="t-h2 hero-title">
      An AI reviewer that shuts up is the only kind you'll keep.
    </h1>
    <p class="t-body mt-16 sec-2">
      MergeMate scores every finding for confidence and posts only the ones that clear the bar. Median: ${esc(
        receipts.commentsPerPr.toFixed(1),
      )} comments per pull request. Silence means the diff was clean.
    </p>
    <div class="mt-24">${demo()}</div>
    <div class="actions mt-24">
      <a class="btn btn-primary" href="/login">${CTA}</a>
    </div>
    <p class="t-sec mt-12">Free forever for public repositories. No card, no trial clock.</p>
  </section>

  <section>
    <p class="t-label">The enemy</p>
    <h2 class="t-h2 mt-8">You didn't uninstall the last one because it missed a bug.</h2>
    <p class="t-body mt-12 sec-2">
      You uninstalled it because it left twenty comments about naming, three of them wrong, on a pull request
      that needed one question answered. First your team scrolled past it. Then they muted it. Then they started
      scrolling past <em>everyone's</em> review comments — which is the part that actually cost you.
    </p>
    <p class="t-body mt-12 sec-2">
      Review latency is the reason you wanted a bot. Noise is the reason you stopped having one.
    </p>
  </section>

  <section>
    <p class="t-label">The device — the restraint number</p>
    <div class="stats mt-12">
      <div class="stat">
        <p class="t-label">Comments per PR</p>
        <p class="t-stat">${esc(receipts.commentsPerPr.toFixed(1))}</p>
      </div>
      <div class="stat">
        <p class="t-label">Clean PRs, silent</p>
        <p class="t-stat">${receipts.cleanSilent}<span class="faint">/${receipts.cleanCases}</span></p>
      </div>
      <div class="stat">
        <p class="t-label">False positives</p>
        <p class="t-stat">${esc(fpRate)}</p>
      </div>
      <div class="stat">
        <p class="t-label">Corpus size</p>
        <p class="t-stat">${receipts.cases}</p>
      </div>
    </div>
    <p class="t-sec mt-16">
      These are our own numbers, from our own harness — <code>npm run eval</code> over the
      ${receipts.cases}-case corpus in <code>src/eval/corpus.ts</code>. The corpus is <strong>synthetic</strong>: cases
      written by hand with the correct answer recorded next to each, plus two patches taken from a real pull request.
      ${
        receipts.usingFakeModel
          ? `This run used MergeMate's deterministic pattern fallback (<code>${esc(
              receipts.model,
            )}</code>), not Claude, because no model key was configured for it. It measures the gate, not the model's judgement.`
          : `Model: <code>${esc(receipts.model)}</code>.`
      }
      MergeMate is pre-launch: there are no customer numbers on this page because there are no customers yet.
    </p>
  </section>

  <section>
    <p class="t-label">The math</p>
    <h2 class="t-h2 mt-8">$12 a developer, against $0.06 a review.</h2>
    <div class="rows mt-16">
      <div class="row"><span class="grow"><span class="t-title">A typical review</span><span class="t-data block">~300 changed lines, two model passes</span></span><span class="t-data">$0.03–0.10</span></div>
      <div class="row"><span class="grow"><span class="t-title">A developer's month</span><span class="t-data block">10–20 pull requests</span></span><span class="t-data">under $2</span></div>
      <div class="row"><span class="grow"><span class="t-title">One hour of a senior reviewer</span><span class="t-data block">what the wait actually costs</span></span><span class="t-data">$50–100</span></div>
    </div>
    <p class="t-sec mt-12">Cost per review is recorded on every run and shown in your dashboard, per repository. No estimates.</p>
  </section>

  <section>
    <p class="t-label">Why you can trust it</p>
    <div class="rows mt-12">
      <div class="row">
        <span class="flex-none">${icon("gauge", 18)}</span>
        <span class="grow"><span class="t-title">A hard confidence gate</span><span class="t-sec block">Every finding is scored by a separate pass. Below the threshold it is recorded in your dashboard and never posted — no "worth a look", no collapsed details block.</span></span>
      </div>
      <div class="row">
        <span class="flex-none">${icon("rulebook", 18)}</span>
        <span class="grow"><span class="t-title">A rulebook you own</span><span class="t-sec block"><code>.mergemate.yml</code> is reviewed and merged like any other code. Every change is a new immutable version, and every comment names the rule and version that produced it.</span></span>
      </div>
      <div class="row">
        <span class="flex-none">${icon("x-dismiss", 18)}</span>
        <span class="grow"><span class="t-title">Dismiss once, never again</span><span class="t-sec block">A thumbs-down or a <code>mergemate ignore</code> reply suppresses that finding's fingerprint for good. The same nit is never re-litigated.</span></span>
      </div>
      <div class="row">
        <span class="flex-none">${icon("shield", 18)}</span>
        <span class="grow"><span class="t-title">Shadow mode on day one</span><span class="t-sec block">Run for a fortnight with findings going to the dashboard only. Nothing reaches a pull request until you have seen what it would have said.</span></span>
      </div>
    </div>
    <div class="actions mt-24">
      <a class="btn btn-primary" href="/login">${CTA}</a>
    </div>
  </section>

  <section>
    <p class="t-label">Pricing</p>
    <div class="rows mt-12">
      <div class="row"><span class="grow"><span class="t-title">Free</span><span class="t-sec block">Public repositories, unlimited reviews, starter rulebook, suppression memory.</span></span><span class="t-data">$0</span></div>
      <div class="row"><span class="grow"><span class="t-title">Team</span><span class="t-sec block">Private repositories, 25 custom rules, 30-day audit log.</span></span><span class="t-data">$12/dev/mo</span></div>
      <div class="row"><span class="grow"><span class="t-title">Business</span><span class="t-sec block">Tunable threshold, org-wide suppressions, priority queue, SSO, 1-year audit log.</span></span><span class="t-data">$20/dev/mo</span></div>
    </div>
    <p class="t-sec mt-12">A seat is a developer who actually opened a pull request that month. Dormant accounts are free.</p>
    <div class="actions mt-24">
      <a class="btn btn-primary" href="/login">${CTA}</a>
    </div>
  </section>

  <section>
    <p class="t-label">Not ready</p>
    <p class="t-body mt-8 sec-2">
      Point it at a pull request without installing anything:
      <code>npm run review:dry-run -- owner/repo#123</code> prints exactly what MergeMate would have posted, and writes nothing.
    </p>
    <p class="t-sec mt-24">
      MergeMate · <a href="/templates/typescript.yml">rulebook templates</a> · <a href="/login">Sign in</a>
    </p>
  </section>
</main>
</body>
</html>`;
}
