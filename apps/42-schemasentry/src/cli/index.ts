#!/usr/bin/env node
/**
 * src/cli/index.ts — the `schemasentry` CLI, the primary adoption surface.
 *
 *   schemasentry diff old.yaml new.yaml        free, offline, no login
 *   schemasentry check spec.yaml --api orders  the CI gate
 *   schemasentry push spec.yaml --api orders   record a deploy
 *
 * `diff` never touches the network and never needs a token: that is the whole
 * top-of-funnel argument, and a `diff` that phoned home would break it. It also
 * always exits 0 — it is a report, not a gate — so nobody wires it into CI by
 * accident and then wonders why the build is red.
 *
 * `check` and `push` talk to `/v1` with a token from `SCHEMASENTRY_TOKEN` or
 * `--token`. Every failure prints a sentence that says what to do next; an
 * unhelpful CI error is the thing that gets a tool removed.
 */

import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { diffRaw, ENGINE_VERSION, SpecParseError } from "@/core";
import { exitCodeFor, palette, renderJson, renderReport, shouldColor, toRenderable, type RenderInput } from "./render";

const DEFAULT_API_URL = process.env.SCHEMASENTRY_API_URL ?? process.env.API_URL ?? "http://localhost:3042";

interface GlobalOptions {
  json?: boolean;
  token?: string;
  apiUrl?: string;
}

function fail(message: string, code = 2): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function readSpec(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    const reason = err instanceof Error && "code" in err && err.code === "ENOENT" ? "no such file" : String(err);
    return fail(`Could not read ${path}: ${reason}`);
  }
}

function colors() {
  return palette(shouldColor(process.stdout, process.env));
}

function print(text: string): void {
  process.stdout.write(text);
}

/* ------------------------------------------------------------------- diff */

async function runDiff(oldPath: string, newPath: string, opts: GlobalOptions & { all?: boolean }): Promise<void> {
  const [before, after] = await Promise.all([readSpec(oldPath), readSpec(newPath)]);

  let result;
  try {
    result = await diffRaw(before, after);
  } catch (err) {
    if (err instanceof SpecParseError) return fail(err.message);
    throw err;
  }

  const input: RenderInput = {
    verdict: result.verdict,
    summary: result.summary,
    fromLabel: oldPath,
    toLabel: newPath,
    findings: toRenderable(opts.all ? result.findings : result.findings),
    specHealth: {
      score: result.to.health.score,
      operations: result.to.health.operations,
      warnings: result.to.health.warnings,
    },
  };

  if (opts.json) {
    print(renderJson({ ...input, engineVersion: ENGINE_VERSION }));
  } else {
    print(renderReport(input, colors(), { footer: true }));
  }
  // Informational by design: `diff` is never a gate.
  process.exit(0);
}

/* ------------------------------------------------------------ hosted calls */

interface HostedResponse {
  error?: string;
  message?: string;
  upgradeTo?: string | null;
  engineVersion?: string;
  verdict?: string;
  baselineSet?: boolean;
  specHealth?: { score: number; operations: number; warnings: string[] };
  deploy?: { version: string; environment: string; idempotent: boolean };
  diff?: {
    verdict: "breaking" | "risky" | "compatible";
    summary: { breaking: number; risky: number; compatible: number; info: number };
    from: string;
    to: string;
    url: string;
    fails: boolean;
    findings: Array<{
      ruleId: string;
      level: "breaking" | "risky" | "compatible" | "info";
      message: string;
      jsonPointer: string;
      endpoint: string | null;
      method: string | null;
      why: string;
    }>;
    consumers: Array<{ name: string; impacted: boolean }>;
  } | null;
}

function tokenFrom(opts: GlobalOptions): string {
  const token = opts.token ?? process.env.SCHEMASENTRY_TOKEN;
  if (!token) {
    return fail(
      [
        "No API token. Set SCHEMASENTRY_TOKEN or pass --token.",
        "Create one in the dashboard under Settings, then add it to your CI secrets.",
        "",
        "`schemasentry diff old.yaml new.yaml` needs no token and works offline.",
      ].join("\n"),
    );
  }
  return token;
}

async function callApi(
  path: string,
  method: "GET" | "POST",
  body: unknown,
  opts: GlobalOptions,
): Promise<{ status: number; data: HostedResponse }> {
  const base = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${tokenFrom(opts)}`,
        "content-type": "application/json",
        "user-agent": `schemasentry-cli/${ENGINE_VERSION}`,
      },
      body: method === "POST" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return fail(`Could not reach ${url}: ${reason}\nSet --api-url or SCHEMASENTRY_API_URL if you self-host.`);
  }
  const text = await res.text();
  let data: HostedResponse;
  try {
    data = text ? (JSON.parse(text) as HostedResponse) : {};
  } catch {
    return fail(`${url} returned ${res.status} with a non-JSON body:\n${text.slice(0, 400)}`);
  }
  return { status: res.status, data };
}

function reportHosted(data: HostedResponse, opts: GlobalOptions, label: { from: string; to: string }): void {
  const diff = data.diff;
  if (!diff) {
    if (opts.json) print(`${JSON.stringify(data, null, 2)}\n`);
    else print(`\n${data.message ?? "Recorded."}\n\n`);
    return;
  }
  const input: RenderInput = {
    verdict: diff.verdict,
    summary: diff.summary,
    fromLabel: diff.from || label.from,
    toLabel: diff.to || label.to,
    findings: diff.findings.map((f) => ({ ...f, impactedConsumers: [] })),
    diffUrl: diff.url,
    impactedConsumers: diff.consumers.filter((c) => c.impacted).map((c) => c.name),
    specHealth: data.specHealth ?? null,
  };
  if (opts.json) print(renderJson({ ...input, engineVersion: data.engineVersion ?? ENGINE_VERSION }));
  else print(renderReport(input, colors()));
}

async function runCheck(
  specPath: string,
  opts: GlobalOptions & { api: string; failOn: string; version?: string; repo?: string; pr?: string; sha?: string },
): Promise<void> {
  const spec = await readSpec(specPath);
  const failOn = opts.failOn === "risky" ? "risky" : opts.failOn === "never" ? "never" : "breaking";

  const pr =
    opts.repo && opts.pr
      ? { repository: opts.repo, number: Number(opts.pr), headSha: opts.sha }
      : undefined;
  if (opts.pr && !opts.repo) fail("--pr needs --repo owner/name so the comment has somewhere to go.");
  if (pr && !Number.isInteger(pr.number)) fail("--pr must be a PR number.");

  const { status, data } = await callApi(
    "/api/v1/check",
    "POST",
    { api: opts.api, spec, version: opts.version ?? null, pr },
    opts,
  );

  if (status >= 400) {
    const suffix = data.upgradeTo ? `\nUpgrade path: ${data.upgradeTo}.` : "";
    fail(`${data.message ?? `The check failed with HTTP ${status}.`}${suffix}`);
  }

  reportHosted(data, opts, { from: "baseline", to: opts.version ?? specPath });
  const verdict = (data.diff?.verdict ?? "compatible") as "breaking" | "risky" | "compatible";
  process.exit(exitCodeFor(verdict, failOn));
}

async function runPush(
  specPath: string,
  opts: GlobalOptions & { api: string; version?: string; env: string; failOn: string },
): Promise<void> {
  const spec = await readSpec(specPath);
  const environment = ["prod", "staging", "pr"].includes(opts.env) ? opts.env : "prod";
  const failOn = opts.failOn === "risky" ? "risky" : opts.failOn === "breaking" ? "breaking" : "never";

  const { status, data } = await callApi(
    "/api/v1/specs",
    "POST",
    { api: opts.api, spec, version: opts.version ?? null, environment },
    opts,
  );

  if (status >= 400) {
    const suffix = data.upgradeTo ? `\nUpgrade path: ${data.upgradeTo}.` : "";
    fail(`${data.message ?? `The push failed with HTTP ${status}.`}${suffix}`);
  }

  // `reportHosted` prints the server's own message when there is no diff to
  // render, so printing it here as well would say the same sentence twice.
  reportHosted(data, opts, { from: "baseline", to: opts.version ?? specPath });
  const verdict = (data.diff?.verdict ?? "compatible") as "breaking" | "risky" | "compatible";
  process.exit(exitCodeFor(verdict, failOn));
}

async function runApis(opts: GlobalOptions): Promise<void> {
  const { status, data } = await callApi("/api/v1/apis", "GET", null, opts);
  if (status >= 400) fail(data.message ?? `Listing APIs failed with HTTP ${status}.`);
  if (opts.json) {
    print(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    const list = (data as unknown as { apis: Array<{ slug: string; name: string }> }).apis ?? [];
    if (list.length === 0) print(`\n${data.message ?? "No APIs registered."}\n\n`);
    else {
      print("\n");
      for (const api of list) print(`  ${api.slug.padEnd(24)} ${api.name}\n`);
      print("\n");
    }
  }
  process.exit(0);
}

/* ------------------------------------------------------------------ wiring */

const program = new Command();

program
  .name("schemasentry")
  .description("The breaking-change watchdog for your API. Diff OpenAPI specs, gate CI, alert consumers.")
  // The version flag is `-V` only. `--version` belongs to `push` and `check`,
  // where it names the deploy being recorded — README's own examples read
  // `push --version $GIT_SHA`, and commander would otherwise answer that with
  // the CLI's own version number and exit 0 without pushing anything.
  .version(ENGINE_VERSION, "-V, --cli-version", "print the CLI version")
  .option("--json", "machine-readable output")
  .option("--token <token>", "API token (or set SCHEMASENTRY_TOKEN)")
  .option("--api-url <url>", `API base URL (default ${DEFAULT_API_URL})`);

program
  .command("diff")
  .description("Diff two spec files locally. Free, offline, no login. Always exits 0.")
  .argument("<old>", "the baseline spec (YAML or JSON)")
  .argument("<new>", "the candidate spec")
  .option("--all", "include compatible findings in the human output")
  .action(async (oldPath: string, newPath: string, cmdOpts: { all?: boolean }) => {
    await runDiff(oldPath, newPath, { ...program.opts<GlobalOptions>(), ...cmdOpts });
  });

program
  .command("check")
  .description("Diff a candidate spec against the registered baseline. Exits non-zero on breakage.")
  .argument("<spec>", "the candidate spec")
  .requiredOption("--api <slug>", "the watched API's slug")
  .option("--version <label>", "version label for this candidate (default: a content hash)")
  .option("--fail-on <level>", "breaking | risky | never", "breaking")
  .option("--repo <owner/name>", "repository, for the PR comment")
  .option("--pr <number>", "pull-request number, for the PR comment")
  .option("--sha <sha>", "head SHA, for the check run")
  .action(async (specPath: string, cmdOpts: Record<string, string | undefined>) => {
    await runCheck(specPath, {
      ...program.opts<GlobalOptions>(),
      api: String(cmdOpts.api),
      failOn: String(cmdOpts.failOn ?? "breaking"),
      version: cmdOpts.version,
      repo: cmdOpts.repo,
      pr: cmdOpts.pr,
      sha: cmdOpts.sha,
    });
  });

program
  .command("push")
  .description("Record a deploy's spec and diff it against the baseline.")
  .argument("<spec>", "the deployed spec")
  .requiredOption("--api <slug>", "the watched API's slug")
  .option("--version <label>", "version label, usually $GIT_SHA")
  .option("--env <environment>", "prod | staging | pr", "prod")
  .option("--fail-on <level>", "breaking | risky | never", "never")
  .action(async (specPath: string, cmdOpts: Record<string, string | undefined>) => {
    await runPush(specPath, {
      ...program.opts<GlobalOptions>(),
      api: String(cmdOpts.api),
      version: cmdOpts.version,
      env: String(cmdOpts.env ?? "prod"),
      failOn: String(cmdOpts.failOn ?? "never"),
    });
  });

program
  .command("apis")
  .description("List the APIs this token can reach.")
  .action(async () => {
    await runApis(program.opts<GlobalOptions>());
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
