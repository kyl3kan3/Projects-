/**
 * The dashboard screens.
 *
 * Deliberately minimal — "the product lives in the PR, not in our UI"
 * (ARCHITECTURE.md). Four screens plus a run detail, mobile-first at 390px:
 *
 *   Reviews    noise stats and the run history, including the silent runs
 *   Repos      hairline rows, one per repository, with an enable toggle
 *   Rulebook   the .mergemate.yml viewer, its version history, and templates
 *   Account    plan, seats, shadow mode, and every suppression in force
 *
 * The run detail is where the gate becomes visible: posted findings and gated
 * findings side by side, each with its confidence meter, so a team can see exactly
 * what MergeMate decided not to say.
 */

import { formatMicroUsd } from "../review/cost";
import { fromBp } from "../rules/rulebook";
import { PLANS, plan as planFor } from "../lib/plans";
import { RULEBOOK_TEMPLATES, TEMPLATE_IDS } from "../rules/templates";
import type { FindingRow, Installation, PlanId, Repository, RulebookVersionRow, SuppressionRow } from "../db/schema";
import type { NoiseStats, RunSummaryRow } from "../db/store";
import {
  categoryChip,
  confidenceMeter,
  emptyState,
  esc,
  page,
  relativeTime,
  renderFindingBody,
  ruleChip,
  trendLine,
} from "./layout";
import { icon } from "./icons";

/* ------------------------------------------------------------- sign-in ----- */

export function signInPage(options: { oauthAvailable: boolean; devLogin: boolean; error?: string }): string {
  return page(
    { title: "Sign in · MergeMate", showTabs: false },
    `<section>
  <h1 class="t-h2">Sign in</h1>
  <p class="t-sec mt-8">The dashboard shows what MergeMate said on your pull requests — and what it decided not to say.</p>
  ${options.error ? `<div class="notice mt-24"><p class="t-body">${esc(options.error)}</p></div>` : ""}
  <div class="stack-lg mt-32">
    ${
      options.oauthAvailable
        ? `<a class="btn btn-primary w-full" href="/auth/github">Continue with GitHub</a>`
        : `<div class="panel"><p class="t-title">GitHub sign-in is not configured</p><p class="t-sec mt-8">Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET from the GitHub App's settings page to enable it.</p></div>`
    }
    ${
      options.devLogin
        ? `<form method="post" action="/login/dev" class="panel stack">
             <p class="t-label">Local development</p>
             <label class="field"><span class="t-label">GitHub login</span>
               <input type="text" name="login" value="kyl3kan3" autocomplete="off" required>
             </label>
             <button class="btn btn-secondary w-full" type="submit">Sign in locally</button>
             <p class="t-sec">Enabled by MERGEMATE_DEV_LOGIN=1 and refused when NODE_ENV is production.</p>
           </form>`
        : ""
    }
  </div>
</section>`,
  );
}

/* ------------------------------------------------------- installations ----- */

export function installationsPage(options: {
  login: string;
  installations: { installation: Installation; repoCount: number; postedLast30: number }[];
}): string {
  const body =
    options.installations.length === 0
      ? emptyState(
          "No installations yet",
          "Install the MergeMate GitHub App on an organisation or account and its repositories will appear here within seconds of the first webhook.",
        )
      : `<div class="rows">${options.installations
          .map(
            ({ installation, repoCount, postedLast30 }) => `<a class="row inherit" href="/app/installations/${esc(
              installation.id,
            )}">
  <span class="grow">
    <span class="t-title block">${esc(installation.accountLogin)}</span>
    <span class="t-data">${esc(planFor(installation.plan).name)} · ${repoCount} repo${
      repoCount === 1 ? "" : "s"
    } · ${postedLast30} comment${postedLast30 === 1 ? "" : "s"} in 30d</span>
  </span>
  ${icon("chevron-right", 18)}
</a>`,
          )
          .join("")}</div>`;

  return page(
    { title: "Installations · MergeMate", login: options.login, showTabs: false },
    `<section>
  <div class="section-head"><h1 class="t-h2">Installations</h1></div>
  ${body}
</section>`,
  );
}

/* -------------------------------------------------------------- reviews ---- */

export function reviewsPage(options: {
  login: string;
  installation: Installation;
  stats: NoiseStats;
  weekly: number[];
  runs: RunSummaryRow[];
  queue: { waiting: number; active: number; failed: number; delayed: number } | null;
}): string {
  const { stats } = options;
  const gated = Math.max(0, stats.findingsTotal - stats.findingsPosted);

  const runRows =
    options.runs.length === 0
      ? emptyState(
          "No reviews yet",
          "Open or push to a pull request in one of this installation's repositories. The first review usually lands within a minute.",
        )
      : `<div class="rows">${options.runs.map(runRow).join("")}</div>`;

  return page(
    {
      title: `${options.installation.accountLogin} · MergeMate`,
      login: options.login,
      activeTab: "reviews",
      installationId: options.installation.id,
    },
    `<section>
  <div class="section-head">
    <h1 class="t-h2">${esc(options.installation.accountLogin)}</h1>
    <a class="t-sec" href="/app">Change</a>
  </div>

  <div class="stats">
    <div class="stat">
      <p class="t-label">Comments per PR (median)</p>
      <p class="t-stat">${esc(stats.medianCommentsPerPr.toFixed(1))}</p>
    </div>
    <div class="stat">
      <p class="t-label">Posted / gated (30d)</p>
      <p class="t-stat">${stats.findingsPosted}<span class="faint"> / ${gated}</span></p>
    </div>
    <div class="stat">
      <p class="t-label">Silent reviews</p>
      <p class="t-stat">${stats.silentRuns}<span class="faint"> / ${stats.runs}</span></p>
    </div>
    <div class="stat">
      <p class="t-label">Model spend (30d)</p>
      <p class="t-stat">${esc(formatMicroUsd(stats.costMicroUsd))}</p>
    </div>
  </div>

  <div class="mt-24">
    ${
      options.weekly.length >= 2
        ? `<p class="t-label">Comments per PR, last ${options.weekly.length} weeks</p>${trendLine(options.weekly)}`
        : `<p class="t-label">Comments per PR, weekly</p><p class="t-sec">A trend needs two weeks of reviews. There ${
            stats.runs === 1 ? "has been 1 review" : `have been ${stats.runs} reviews`
          } so far.</p>`
    }
  </div>

  ${
    stats.thumbsUp + stats.thumbsDown > 0
      ? `<p class="t-sec mt-16">Feedback in the last 30 days: ${stats.thumbsUp} kept, ${stats.thumbsDown} dismissed.</p>`
      : ""
  }
  ${
    options.queue
      ? `<p class="t-data mt-16">queue ${options.queue.active} active · ${options.queue.waiting} waiting · ${options.queue.delayed} delayed · ${options.queue.failed} failed</p>`
      : `<p class="t-data mt-16">no redis configured — reviews run inline on the webhook</p>`
  }
</section>

<section>
  <div class="section-head"><h2 class="t-h2">Reviews</h2></div>
  ${runRows}
</section>`,
  );
}

function runRow(run: RunSummaryRow): string {
  const meta = [
    `${esc(run.repoFullName)}#${run.prNumber}`,
    run.status === "posted"
      ? `${run.findingsPosted} posted`
      : run.status === "silent"
        ? "silent"
        : run.status,
    `${formatMicroUsd(run.costMicroUsd)}`,
    `${(run.latencyMs / 1000).toFixed(1)}s`,
  ].join(" · ");
  return `<a class="row inherit" href="/app/runs/${esc(run.runId)}">
  <span class="flex-none">${statusGlyph(run.status)}</span>
  <span class="grow">
    <span class="t-title block">${esc(run.prTitle || `Pull request #${run.prNumber}`)}</span>
    <span class="t-data">${meta}</span>
    ${run.detail ? `<span class="t-data faint block">${esc(run.detail)}</span>` : ""}
  </span>
  <span class="t-data faint flex-none">${esc(relativeTime(run.createdAt))}</span>
</a>`;
}

function statusGlyph(status: string): string {
  if (status === "posted") return icon("reviews", 18);
  if (status === "silent") return icon("check", 18);
  if (status === "failed") return icon("x-dismiss", 18);
  return icon("diff", 18);
}

/* ----------------------------------------------------------- run detail ---- */

export function runDetailPage(options: {
  login: string;
  installation: Installation;
  run: RunSummaryRow;
  findings: FindingRow[];
  thresholdBp: number;
  rulebookVersion: number | null;
}): string {
  const posted = options.findings.filter((f) => f.posted);
  const gated = options.findings.filter((f) => !f.posted);

  return page(
    {
      title: `Review of #${options.run.prNumber} · MergeMate`,
      login: options.login,
      activeTab: "reviews",
      installationId: options.installation.id,
    },
    `<section>
  <div class="summary-bar">
    ${icon("merge-node", 18)}
    <span class="t-sec">${esc(options.run.prTitle || `Pull request #${options.run.prNumber}`)} · #${
      options.run.prNumber
    } · ${
      posted.length > 0
        ? `This PR: ${posted.length} finding${posted.length === 1 ? "" : "s"}`
        : gated.length === 0
          ? "Passed clean. That's the point."
          : `Nothing cleared the gate. ${gated.length} candidate${gated.length === 1 ? "" : "s"} recorded below.`
    }</span>
  </div>
  <p class="t-data mt-12">${esc(options.run.repoFullName)} · ${esc(
    options.run.trigger,
  )} · model ${esc(options.run.model || "none")} · ${esc(
    formatMicroUsd(options.run.costMicroUsd),
  )} · ${(options.run.latencyMs / 1000).toFixed(1)}s${
    options.rulebookVersion !== null ? ` · rulebook v${options.rulebookVersion}` : ""
  }</p>
  ${options.run.detail ? `<p class="t-sec mt-8">${esc(options.run.detail)}</p>` : ""}
</section>

<section>
  <div class="section-head"><h2 class="t-h2">Posted</h2><span class="t-data">${posted.length}</span></div>
  ${
    posted.length === 0
      ? emptyState(
          "Nothing was posted",
          "Either the diff was clean or nothing cleared the confidence gate. Silence on a pull request is the designed outcome, not a failure.",
        )
      : `<div class="stack-lg">${posted
          .map((f) => findingCard(f, options.thresholdBp, false))
          .join("")}</div>`
  }
</section>

<section>
  <div class="section-head"><h2 class="t-h2">Gated</h2><span class="t-data">${gated.length}</span></div>
  <p class="t-sec mb-16">Recorded, never posted. This is the noise MergeMate withheld.</p>
  ${
    gated.length === 0
      ? emptyState("Nothing was gated", "Every candidate finding in this run cleared the bar.")
      : `<div class="stack-lg">${gated
          .map((f) => findingCard(f, options.thresholdBp, true))
          .join("")}</div>`
  }
</section>`,
  );
}

const DROP_REASON_COPY: Record<string, string> = {
  below_threshold: "below the confidence threshold",
  suppressed: "fingerprint dismissed earlier",
  over_cap: "over the per-PR comment cap",
  category_disabled: "category switched off in the rulebook",
  path_excluded: "path excluded by the rulebook",
  unanchorable: "could not be anchored to an exact diff line",
  duplicate: "duplicate of another finding in this run",
  shadow_mode: "withheld by shadow mode",
  already_posted: "already commented on an earlier push",
};

function findingCard(finding: FindingRow, thresholdBp: number, gated: boolean): string {
  const patch = finding.suggestedPatch;
  return `<article class="finding${gated ? " gated" : ""}">
  <div class="finding-head">
    <span class="chip">${esc(finding.filePath)}:${finding.startLine}</span>
    ${categoryChip(finding.category)}
    ${ruleChip(finding.ruleId)}
  </div>
  ${confidenceMeter(finding.confidenceBp, thresholdBp)}
  <p class="t-title">${esc(finding.title)}</p>
  ${renderFindingBody(finding.bodyMd)}
  ${
    patch
      ? `<pre class="well"><code>${patch
          .split("\n")
          .map((l) => `<span class="diff-add">+ ${esc(l)}</span>`)
          .join("\n")}</code></pre>`
      : ""
  }
  <p class="t-data">${
    gated
      ? `withheld — ${esc(DROP_REASON_COPY[finding.dropReason ?? ""] ?? finding.dropReason ?? "gated")}`
      : `posted${finding.githubCommentId ? ` · comment ${finding.githubCommentId}` : ""}`
  } · threshold ${esc(fromBp(thresholdBp).toFixed(2))}</p>
</article>`;
}

/* --------------------------------------------------------- repositories ---- */

export function repositoriesPage(options: {
  login: string;
  installation: Installation;
  repositories: { repo: Repository; runs: number; posted: number; rulebookVersion: number | null }[];
}): string {
  const rows =
    options.repositories.length === 0
      ? emptyState(
          "No repositories yet",
          "Repositories appear as soon as the installation's first webhook arrives, or immediately if you granted access to specific repositories.",
        )
      : `<div class="rows">${options.repositories
          .map(({ repo, runs, posted, rulebookVersion }) => {
            const perPr = runs === 0 ? "no reviews yet" : `${(posted / runs).toFixed(1)} comments/PR`;
            return `<div class="row">
  <span class="grow">
    <span class="t-title block">${esc(repo.fullName)}</span>
    <span class="t-data">${repo.isPrivate ? "private" : "public"} · ${runs} PR${
      runs === 1 ? "" : "s"
    } · ${esc(perPr)}${rulebookVersion !== null ? ` · rulebook v${rulebookVersion}` : " · no rulebook"}</span>
  </span>
  <form method="post" action="/app/repositories/${esc(repo.id)}/enabled" class="flex-none">
    <input type="hidden" name="enabled" value="${repo.enabled ? "0" : "1"}">
    <button class="btn btn-secondary h-44" type="submit">${
      repo.enabled ? "Reviewing" : "Paused"
    }</button>
  </form>
</div>`;
          })
          .join("")}</div>`;

  return page(
    {
      title: `Repositories · ${options.installation.accountLogin} · MergeMate`,
      login: options.login,
      activeTab: "repos",
      installationId: options.installation.id,
    },
    `<section>
  <div class="section-head"><h1 class="t-h2">Repositories</h1></div>
  <p class="t-sec mb-16">${
    planFor(options.installation.plan).privateRepos
      ? "Public and private repositories are both reviewed on this plan."
      : "Public repositories are reviewed free. Private repositories need the Team plan; MergeMate skips them without spending tokens."
  }</p>
  ${rows}
</section>`,
  );
}

/* -------------------------------------------------------------- rulebook --- */

export function rulebookPage(options: {
  login: string;
  installation: Installation;
  repositories: Repository[];
  selected: Repository | null;
  active: RulebookVersionRow | null;
  versions: RulebookVersionRow[];
  ruleFireCounts: Record<string, number>;
}): string {
  const selector =
    options.repositories.length <= 1
      ? ""
      : `<div class="rows mb-24">${options.repositories
          .map(
            (r) => `<a class="row inherit" href="/app/installations/${esc(options.installation.id)}/rulebook?repo=${esc(
              r.id,
            )}">
  <span class="grow"><span class="t-title">${esc(r.fullName)}</span></span>
  ${r.id === options.selected?.id ? icon("check", 18) : icon("chevron-right", 18)}
</a>`,
          )
          .join("")}</div>`;

  const rules = parseRulesForDisplay(options.active);

  const viewer = options.active
    ? `<div class="panel">
    <div class="section-head">
      <p class="t-label">${esc(options.selected?.fullName ?? "")} · .mergemate.yml</p>
      <span class="t-data">v${options.active.version}${options.active.isValid ? "" : " · invalid"}</span>
    </div>
    <pre class="well"><code>${esc(options.active.rawYaml)}</code></pre>
  </div>
  ${
    rules.length > 0
      ? `<div class="rows mt-24">${rules
          .map(
            (rule) => `<div class="row">
  <span class="grow">
    <span class="t-title block">${esc(rule.id)}</span>
    <span class="t-data">${esc(rule.category)} · ${esc(rule.severity)} · fired ${
      options.ruleFireCounts[rule.id] ?? 0
    }× / 30d</span>
  </span>
  <span class="chip flex-none">${rule.enabled ? "on" : "off"}</span>
</div>`,
          )
          .join("")}</div>`
      : ""
  }`
    : emptyState(
        "No rulebook committed",
        "Without .mergemate.yml MergeMate reports bugs and security issues only — standards enforcement needs rules to point at. Commit one of the starter templates below to the default branch and the next push versions it.",
      );

  const history =
    options.versions.length === 0
      ? ""
      : `<section>
  <div class="section-head"><h2 class="t-h2">Versions</h2></div>
  <div class="rows">${options.versions
    .map(
      (v) => `<div class="row">
  <span class="grow">
    <span class="t-title block">v${v.version}${v.isValid ? "" : " — rejected"}</span>
    <span class="t-data">${esc(v.commitSha.slice(0, 8))} · ${esc(relativeTime(v.createdAt))}</span>
    ${
      v.validationErrors.length > 0
        ? `<span class="t-data danger block">${esc(
            v.validationErrors.join("; "),
          )}</span>`
        : ""
    }
  </span>
  ${v.isValid ? icon("check", 18) : icon("x-dismiss", 18)}
</div>`,
    )
    .join("")}</div>
</section>`;

  return page(
    {
      title: `Rulebook · ${options.installation.accountLogin} · MergeMate`,
      login: options.login,
      activeTab: "rulebook",
      installationId: options.installation.id,
    },
    `<section>
  <div class="section-head"><h1 class="t-h2">Rulebook</h1></div>
  ${selector}
  ${viewer}
</section>
${history}
<section>
  <div class="section-head"><h2 class="t-h2">Starter templates</h2></div>
  <div class="rows">${TEMPLATE_IDS.map((id) => {
    const t = RULEBOOK_TEMPLATES[id];
    return `<a class="row inherit" href="/templates/${esc(t.id)}.yml">
  <span class="grow">
    <span class="t-title block">${esc(t.label)}</span>
    <span class="t-data">${esc(t.blurb)}</span>
  </span>
  ${icon("link", 18)}
</a>`;
  }).join("")}</div>
</section>`,
  );
}

interface DisplayRule {
  id: string;
  category: string;
  severity: string;
  enabled: boolean;
}

function parseRulesForDisplay(version: RulebookVersionRow | null): DisplayRule[] {
  if (!version || !version.isValid || version.parsed === null || typeof version.parsed !== "object") {
    return [];
  }
  const parsed = version.parsed as { rules?: unknown };
  if (!Array.isArray(parsed.rules)) return [];
  return parsed.rules.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const rule = raw as { id?: unknown; category?: unknown; severity?: unknown; enabled?: unknown };
    if (typeof rule.id !== "string") return [];
    return [
      {
        id: rule.id,
        category: typeof rule.category === "string" ? rule.category : "standards",
        severity: typeof rule.severity === "string" ? rule.severity : "medium",
        enabled: rule.enabled !== false,
      },
    ];
  });
}

/* --------------------------------------------------------------- account --- */

export function accountPage(options: {
  login: string;
  installation: Installation;
  seatsUsed: number;
  seatLimit: number;
  suppressions: SuppressionRow[];
  thresholdBp: number;
}): string {
  const plan = planFor(options.installation.plan);
  const shadow = options.installation.settings.shadowMode === true;

  return page(
    {
      title: `Account · ${options.installation.accountLogin} · MergeMate`,
      login: options.login,
      activeTab: "account",
      installationId: options.installation.id,
    },
    `<section>
  <div class="section-head"><h1 class="t-h2">Account</h1></div>
  <div class="rows">
    <div class="row"><span class="grow"><span class="t-title">Plan</span></span><span class="t-data">${esc(
      plan.name,
    )}${plan.pricePerSeatUsd > 0 ? ` · $${plan.pricePerSeatUsd}/dev/mo` : ""}</span></div>
    <div class="row"><span class="grow"><span class="t-title">Seats this month</span><span class="t-data block">unique pull-request authors</span></span><span class="t-data">${
      options.seatsUsed
    }${options.seatLimit > 0 ? ` / ${options.seatLimit}` : ""}</span></div>
    <div class="row"><span class="grow"><span class="t-title">Confidence threshold</span><span class="t-data block">${
      plan.tunableThreshold ? "tunable on this plan" : "set by the repository rulebook"
    }</span></span><span class="t-data">${esc(fromBp(options.thresholdBp).toFixed(2))}</span></div>
    <div class="row">
      <span class="grow"><span class="t-title">Shadow mode</span><span class="t-data block">findings go to this dashboard only, nothing is posted</span></span>
      <form method="post" action="/app/installations/${esc(options.installation.id)}/shadow" class="flex-none">
        <input type="hidden" name="shadow" value="${shadow ? "0" : "1"}">
        <button class="btn btn-secondary h-44" type="submit">${shadow ? "On" : "Off"}</button>
      </form>
    </div>
  </div>
  ${
    options.installation.plan === "free"
      ? `<div class="panel mt-24">
           <p class="t-title">Private repositories need a paid plan</p>
           <p class="t-sec mt-8">Public repositories stay free forever. Team is $${
             PLANS.team.pricePerSeatUsd
           }/dev/month and counts a seat only for developers who actually opened a pull request that month.</p>
         </div>`
      : ""
  }
</section>

<section>
  <div class="section-head"><h2 class="t-h2">Suppressed findings</h2><span class="t-data">${
    options.suppressions.length
  }</span></div>
  <p class="t-sec mb-16">Dismissed once, never raised again. ${
    plan.orgWideSuppressions ? "Dismissals apply across the whole organisation on this plan." : "Dismissals apply to the repository they were made in."
  }</p>
  ${
    options.suppressions.length === 0
      ? emptyState(
          "Nothing suppressed",
          "React with a thumbs-down on a MergeMate comment, or reply “mergemate ignore”, and that finding's fingerprint stops appearing.",
        )
      : `<div class="rows">${options.suppressions
          .map(
            (s) => `<div class="row">
  <span class="grow">
    <span class="t-data block">${esc(s.fingerprint.slice(0, 16))}</span>
    <span class="t-data faint">${esc(s.scope)} · via ${esc(s.reason)} · ${esc(
      s.createdByLogin,
    )} · ${esc(relativeTime(s.createdAt))}</span>
  </span>
</div>`,
          )
          .join("")}</div>`
  }
</section>`,
  );
}

export function errorPage(status: number, message: string): string {
  return page(
    { title: `${status} · MergeMate`, showTabs: false },
    `<section>
  <h1 class="t-h2">${status}</h1>
  <p class="t-body mt-8">${esc(message)}</p>
  <p class="mt-24"><a class="btn btn-secondary" href="/app">Back to installations</a></p>
</section>`,
  );
}

export type { PlanId };
