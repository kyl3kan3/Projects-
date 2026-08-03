/**
 * Change detection: fetch a monitored municipal page, reduce it to the text a
 * requirement actually lives in, and compare that against the last snapshot.
 *
 * Nothing in this module publishes anything. A meaningful difference becomes a
 * `requirement_changes` row with `review_state = 'pending'`, and a curator decides
 * what it means. That is deliberate — an automated diff cannot tell "fee table
 * reformatted" from "load calculation now required", and guessing wrong is how a
 * requirements database loses the only thing it sells.
 *
 * We are also guests on servers paid for by taxpayers: identified user agent,
 * conditional GETs, one request per host at a time, and a source that fails three
 * times running is marked broken and surfaced — silence must never read as "no
 * change".
 */

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { diffLines } from "diff";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jurisdictionSources, requirementChanges, type JurisdictionSource } from "@/db/schema";
import { env } from "@/lib/env";

const FAILURES_BEFORE_BROKEN = 3;
const FETCH_TIMEOUT_MS = 15_000;
/** A municipal fee schedule is text; anything this size is a download, not a page. */
const MAX_BYTES = 2_000_000;

/* ------------------------------------------------------------------ *
 * Pure text pipeline
 * ------------------------------------------------------------------ */

/**
 * Reduce HTML to the content region's visible text. Navigation, footers, scripts,
 * and cookie banners change constantly and mean nothing, so they are stripped
 * before hashing — otherwise every crawl produces a "change".
 */
export function extractContent(html: string, selector?: string | null): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, form, iframe, svg").remove();
  $("[role=navigation], [aria-hidden=true], .cookie-banner, #cookie-banner").remove();

  const candidates = [selector, "main", "#content", "article", "body"].filter(
    (s): s is string => Boolean(s),
  );
  for (const candidate of candidates) {
    const region = $(candidate).first();
    if (region.length > 0) {
      const text = normalizeText(region.text());
      if (text.length > 0) return text;
    }
  }
  return normalizeText($.root().text());
}

/**
 * Collapse the whitespace noise that makes municipal CMS output diff against
 * itself: trailing spaces, tabs, blank-line runs, non-breaking spaces.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join("\n")
    .trim();
}

export function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface DiffSummary {
  summary: string;
  rawDiff: string;
  addedLines: number;
  removedLines: number;
  /** False when the change is whitespace-only after normalisation. */
  meaningful: boolean;
}

/**
 * Line diff plus a summary a curator can triage from the queue without opening
 * it: how much moved, and the nearest heading-ish line to the first change.
 */
export function computeDiff(previous: string, current: string): DiffSummary {
  const parts = diffLines(normalizeText(previous), normalizeText(current));
  const chunks: string[] = [];
  let addedLines = 0;
  let removedLines = 0;
  let anchor: string | null = null;

  for (const part of parts) {
    const lines = part.value.split("\n").filter((l) => l.length > 0);
    if (part.added) {
      addedLines += lines.length;
      if (!anchor) anchor = lines[0] ?? null;
      chunks.push(...lines.map((l) => `+ ${l}`));
    } else if (part.removed) {
      removedLines += lines.length;
      if (!anchor) anchor = lines[0] ?? null;
      chunks.push(...lines.map((l) => `- ${l}`));
    } else if (lines.length > 0) {
      // Two lines of context either side is enough to see what moved.
      const head = lines.slice(0, 2).map((l) => `  ${l}`);
      const tail = lines.length > 2 ? lines.slice(-2).map((l) => `  ${l}`) : [];
      chunks.push(...head, ...(lines.length > 4 ? ["  …"] : []), ...tail);
    }
  }

  const changed = addedLines + removedLines;
  const anchorText = anchor ? anchor.slice(0, 60) : null;
  const summary =
    changed === 0
      ? "No text change"
      : `${changed} line${changed === 1 ? "" : "s"} changed${anchorText ? ` near "${anchorText}"` : ""}`;

  return {
    summary,
    rawDiff: chunks.join("\n"),
    addedLines,
    removedLines,
    meaningful: changed > 0,
  };
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

export interface FetchOutcome {
  status: "ok" | "not_modified" | "failed";
  html: string | null;
  error: string | null;
  httpStatus: number | null;
}

/**
 * Polite conditional GET. `fetchImpl` is injectable so the pipeline can be tested
 * end to end against a controlled page without reaching a real city's server.
 */
export async function fetchSource(
  source: Pick<JurisdictionSource, "url" | "lastSnapshotHash">,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(source.url, {
      headers: {
        "user-agent": env.crawlerUserAgent,
        accept: "text/html,application/xhtml+xml",
        ...(source.lastSnapshotHash ? { "if-none-match": `"${source.lastSnapshotHash}"` } : {}),
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status === 304) {
      return { status: "not_modified", html: null, error: null, httpStatus: 304 };
    }
    if (!response.ok) {
      return {
        status: "failed",
        html: null,
        error: `HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }
    const html = await response.text();
    if (html.length > MAX_BYTES) {
      return {
        status: "failed",
        html: null,
        error: `Response too large (${html.length} bytes)`,
        httpStatus: response.status,
      };
    }
    return { status: "ok", html, error: null, httpStatus: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return {
      status: "failed",
      html: null,
      error: controller.signal.aborted ? `Timed out after ${FETCH_TIMEOUT_MS}ms` : message,
      httpStatus: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * The crawl
 * ------------------------------------------------------------------ */

export interface CrawlResult {
  sourceId: string;
  outcome: "unchanged" | "changed" | "failed" | "first_snapshot";
  changeId: string | null;
  error: string | null;
  bytes: number;
  ms: number;
}

/** Sources whose next crawl is due. Postgres does the date arithmetic. */
export async function dueSources(limit = 10): Promise<JurisdictionSource[]> {
  const db = getDb();
  return db
    .select()
    .from(jurisdictionSources)
    .where(
      and(
        eq(jurisdictionSources.status, "active"),
        or(
          isNull(jurisdictionSources.lastCrawledAt),
          lte(
            jurisdictionSources.lastCrawledAt,
            sql`now() - (${jurisdictionSources.crawlFrequencyHours} * interval '1 hour')`,
          ),
        ),
      ),
    )
    .orderBy(jurisdictionSources.lastCrawledAt)
    .limit(limit);
}

/**
 * Crawl one source. Per-host serialisation is the caller's job (the tick walks
 * sources one at a time within its budget), which keeps this function honest and
 * testable.
 */
export async function crawlSource(
  source: JurisdictionSource,
  fetchImpl: typeof fetch = fetch,
): Promise<CrawlResult> {
  const db = getDb();
  const started = Date.now();
  const fetched = await fetchSource(source, fetchImpl);

  if (fetched.status === "failed") {
    const failureCount = source.failureCount + 1;
    const broken = failureCount >= FAILURES_BEFORE_BROKEN;
    await db
      .update(jurisdictionSources)
      .set({
        failureCount,
        lastError: fetched.error,
        lastCrawledAt: sql`now()`,
        status: broken ? "broken" : source.status,
      })
      .where(eq(jurisdictionSources.id, source.id));
    return {
      sourceId: source.id,
      outcome: "failed",
      changeId: null,
      error: fetched.error,
      bytes: 0,
      ms: Date.now() - started,
    };
  }

  if (fetched.status === "not_modified" || !fetched.html) {
    await db
      .update(jurisdictionSources)
      .set({ lastCrawledAt: sql`now()`, failureCount: 0, lastError: null })
      .where(eq(jurisdictionSources.id, source.id));
    return {
      sourceId: source.id,
      outcome: "unchanged",
      changeId: null,
      error: null,
      bytes: 0,
      ms: Date.now() - started,
    };
  }

  const content = extractContent(fetched.html, source.selector);
  const hash = hashContent(content);

  if (hash === source.lastSnapshotHash) {
    await db
      .update(jurisdictionSources)
      .set({ lastCrawledAt: sql`now()`, failureCount: 0, lastError: null })
      .where(eq(jurisdictionSources.id, source.id));
    return {
      sourceId: source.id,
      outcome: "unchanged",
      changeId: null,
      error: null,
      bytes: fetched.html.length,
      ms: Date.now() - started,
    };
  }

  const firstSnapshot = !source.lastSnapshot;
  let changeId: string | null = null;

  if (!firstSnapshot) {
    const diff = computeDiff(source.lastSnapshot ?? "", content);
    if (diff.meaningful) {
      const [change] = await db
        .insert(requirementChanges)
        .values({
          jurisdictionId: source.jurisdictionId,
          sourceId: source.id,
          origin: "crawl_diff",
          diffSummary: diff.summary,
          rawDiff: diff.rawDiff.slice(0, 20_000),
          reviewState: "pending",
        })
        .returning({ id: requirementChanges.id });
      changeId = change.id;
    }
  }

  await db
    .update(jurisdictionSources)
    .set({
      lastCrawledAt: sql`now()`,
      lastSnapshot: content,
      lastSnapshotHash: hash,
      failureCount: 0,
      lastError: null,
    })
    .where(eq(jurisdictionSources.id, source.id));

  return {
    sourceId: source.id,
    outcome: firstSnapshot ? "first_snapshot" : changeId ? "changed" : "unchanged",
    changeId,
    error: null,
    bytes: fetched.html.length,
    ms: Date.now() - started,
  };
}

/** Take a source out of the rotation, or put a fixed one back. */
export async function setSourceStatus(
  sourceId: string,
  status: "active" | "paused" | "broken",
): Promise<void> {
  const db = getDb();
  await db
    .update(jurisdictionSources)
    .set({ status, ...(status === "active" ? { failureCount: 0, lastError: null } : {}) })
    .where(eq(jurisdictionSources.id, sourceId));
}
