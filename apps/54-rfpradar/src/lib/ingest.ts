/**
 * src/lib/ingest.ts
 *
 * Ingestion: the SAM.gov Opportunities API plus the state-portal connector
 * framework. Every notice is normalized into the shared `opportunities` store,
 * upserted by `(source_id, external_id)`, with a content hash that
 * short-circuits unchanged records and an amendment trail for the ones that
 * moved.
 *
 * ## Connector contract
 *
 * `fetch(source) -> RawNotice[]`. There are four connectors, not one per state:
 * `api` (SAM.gov), `rss`, `csv`, and `html`. A state is a **row in `sources`**
 * whose `config` names its URLs and maps its field names, so adding a state is
 * a seed row rather than a code change — the cheap-additions framework the
 * README promises.
 *
 * ## Politeness is a feature
 *
 * Per-source `poll_interval_minutes`, an honest `User-Agent`
 * (`INGEST_USER_AGENT`), one request at a time per source with a small delay
 * between pages, a hard timeout, and a content hash so an unchanged notice
 * costs one row read and no write. Hammering a portal is a build failure.
 *
 * ## Failure is loud, never silent
 *
 * A connector failure never throws past its source. It flips
 * `sources.status` to `degraded` or `down` with a `status_note` that the radar
 * and the morning scan render verbatim ("VA eVA: last success 9h ago"). Silent
 * staleness is the one outcome this module refuses to produce.
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  opportunities,
  opportunityEvents,
  sources,
  type NewOpportunity,
  type Opportunity,
  type Source,
} from "@/db/schema";
import { env } from "@/lib/env";
import { fixtureNotices } from "@/lib/ingest-fixtures";
import {
  htmlToText,
  parseCodeList,
  parseCsvRecords,
  parseFeedItems,
  parseFlexibleDate,
  parseValueBand,
} from "@/lib/parse";

export interface RawNotice {
  externalId: string;
  title: string;
  agency: string;
  state: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  description: string;
  url: string;
  postedAt: Date;
  questionsDueAt: Date | null;
  responsesDueAt: Date | null;
  estValueBand: { minCents?: number; maxCents?: number } | null;
  raw: unknown;
}

/** `sources.config` shape. Everything a connector needs to do its job. */
export interface SourceConfig {
  urls?: string[];
  /** USPS code stamped on every notice from this source; null = federal. */
  state?: string | null;
  agencyFallback?: string;
  /** Field-name map for rss/csv sources. */
  map?: Record<string, string>;
  /** CSS selectors for html sources. */
  selectors?: { row?: string; title?: string; link?: string; agency?: string; due?: string; questions?: string; description?: string; id?: string };
  /**
   * Fall back to the bundled sample feed when the live fetch is impossible
   * (missing credential, unreachable portal). The source is flagged `degraded`
   * with a "Sample feed" note that the UI shows verbatim — the product never
   * presents a sample as a live tender. Off by default in production seeds.
   */
  sampleFallback?: boolean;
  /** Cap on notices pulled per poll, per source. */
  limit?: number;
  /** Cap on SAM.gov description fetches per poll (one extra request each). */
  descriptionBudget?: number;
}

export class MissingCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingCredentialError";
  }
}

export interface Connector {
  kind: Source["kind"];
  fetch(source: Source, now: Date): Promise<RawNotice[]>;
}

/* --------------------------------------------------------------- fetching */

const FETCH_TIMEOUT_MS = 15_000;
/** One request at a time per source, with this gap between them. */
const PAGE_DELAY_MS = 400;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, accept: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": env.ingestUserAgent, accept },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} from ${hostOf(url)}`);
  }
  return await response.text();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/* ---------------------------------------------------------- SAM.gov (api) */

interface SamRecord {
  noticeId?: string;
  solicitationNumber?: string;
  title?: string;
  fullParentPathName?: string;
  department?: string;
  naicsCode?: string;
  naicsCodes?: string[];
  classificationCode?: string;
  description?: string;
  uiLink?: string;
  postedDate?: string;
  responseDeadLine?: string;
  award?: { amount?: string };
  placeOfPerformance?: { state?: { code?: string } };
  officeAddress?: { state?: string };
  additionalInfoLink?: string;
  type?: string;
  active?: string;
}

/**
 * SAM.gov Opportunities API v2. Documented, keyed, rate-limited.
 *
 * The search response returns `description` as a URL to the notice text rather
 * than the text itself, so descriptions are fetched separately under a bounded
 * budget (`config.descriptionBudget`, default 25). A notice whose description
 * could not be fetched keeps an empty description and says so in `raw` — the
 * scorer then simply finds no keyword hits in it, which is the honest outcome.
 */
export const samConnector: Connector = {
  kind: "api",
  async fetch(source, now) {
    const config = (source.config ?? {}) as SourceConfig;
    const key = env.samGovApiKey;
    if (!key) {
      throw new MissingCredentialError(
        "SAM_GOV_API_KEY is not set, so the federal feed cannot be polled.",
      );
    }

    // The API takes a posted-date window in MM/DD/YYYY. Ask for the window
    // since the last success (plus a day of overlap, because amendments land
    // late), capped at 7 days so a long outage cannot request a year at once.
    const since = source.lastSuccessAt ?? new Date(now.getTime() - 2 * 86_400_000);
    const from = new Date(Math.max(since.getTime() - 86_400_000, now.getTime() - 7 * 86_400_000));
    const limit = Math.min(config.limit ?? 200, 1_000);

    const url = new URL("https://api.sam.gov/opportunities/v2/search");
    url.searchParams.set("api_key", key);
    url.searchParams.set("postedFrom", usDate(from));
    url.searchParams.set("postedTo", usDate(now));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("ptype", "o,k,r"); // solicitation, combined synopsis, sources sought

    const body = await fetchText(url.toString(), "application/json");
    let payload: { opportunitiesData?: SamRecord[]; totalRecords?: number };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      throw new Error("SAM.gov returned a body that is not JSON.");
    }
    const records = payload.opportunitiesData ?? [];

    const budget = config.descriptionBudget ?? 25;
    const notices: RawNotice[] = [];
    let fetched = 0;

    for (const record of records) {
      const externalId = record.noticeId ?? record.solicitationNumber;
      if (!externalId || !record.title) continue;

      let description = "";
      const descriptionUrl = record.description;
      if (descriptionUrl && /^https?:\/\//.test(descriptionUrl) && fetched < budget) {
        fetched += 1;
        try {
          await sleep(PAGE_DELAY_MS);
          const raw = await fetchText(
            `${descriptionUrl}${descriptionUrl.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}`,
            "application/json, text/html",
          );
          description = htmlToText(extractSamDescription(raw));
        } catch {
          description = "";
        }
      } else if (descriptionUrl && !/^https?:\/\//.test(descriptionUrl)) {
        description = htmlToText(descriptionUrl);
      }

      const postedAt = parseFlexibleDate(record.postedDate) ?? now;
      const responsesDueAt = parseFlexibleDate(record.responseDeadLine);
      notices.push({
        externalId,
        title: record.title.trim(),
        agency: (record.fullParentPathName ?? record.department ?? "Federal agency").trim(),
        state: null, // Federal notices are federal scope; place of performance lives in raw.
        naicsCodes: parseCodeList(record.naicsCodes ?? record.naicsCode),
        pscCodes: parseCodeList(record.classificationCode),
        description,
        url: record.uiLink ?? `https://sam.gov/opp/${externalId}/view`,
        postedAt,
        // SAM.gov does not publish a separate questions date on the search
        // record; it lives in the notice text. Left null rather than guessed.
        questionsDueAt: null,
        responsesDueAt,
        estValueBand: record.award?.amount ? parseValueBand(record.award.amount) : null,
        raw: { ...record, descriptionFetched: description.length > 0 },
      });
    }
    return notices;
  },
};

function extractSamDescription(body: string): string {
  try {
    const parsed = JSON.parse(body) as { description?: string } | string;
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed.description === "string") return parsed.description;
  } catch {
    /* not JSON: it's the HTML body itself */
  }
  return body;
}

function usDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}

/* ------------------------------------------------------- state connectors */

function pick(record: Record<string, string>, names: string[] | undefined): string {
  if (!names) return "";
  for (const name of names) {
    const value = record[name];
    if (value) return value;
  }
  return "";
}

function mapNames(config: SourceConfig, key: string, fallbacks: string[]): string[] {
  const mapped = config.map?.[key];
  return mapped ? [mapped, ...fallbacks] : fallbacks;
}

/** RSS 2.0 / Atom. Virginia eVA, Maryland eMMA, and the Georgia registry shape. */
export const rssConnector: Connector = {
  kind: "rss",
  async fetch(source, now) {
    const config = (source.config ?? {}) as SourceConfig;
    const urls = config.urls ?? [];
    if (urls.length === 0) throw new Error("No feed URL configured for this source.");

    const notices: RawNotice[] = [];
    for (const [index, url] of urls.entries()) {
      if (index > 0) await sleep(PAGE_DELAY_MS);
      const xml = await fetchText(url, "application/rss+xml, application/xml, text/xml");
      for (const item of parseFeedItems(xml)) {
        const fields = item.fields;
        const externalId =
          pick(fields, mapNames(config, "id", ["guid", "id", "solicitationNumber"])) || item.link;
        if (!externalId || !item.title) continue;
        const description = htmlToText(item.description || "");
        notices.push({
          externalId,
          title: item.title,
          agency:
            pick(fields, mapNames(config, "agency", ["agency", "department", "author", "dc:creator"])) ||
            config.agencyFallback ||
            source.name,
          state: config.state ?? null,
          naicsCodes: parseCodeList(pick(fields, mapNames(config, "naics", ["naics", "naicsCode"]))),
          pscCodes: parseCodeList(pick(fields, mapNames(config, "psc", ["psc", "commodityCode"]))),
          description,
          url: item.link || url,
          postedAt: parseFlexibleDate(item.pubDate) ?? now,
          questionsDueAt: parseFlexibleDate(
            pick(fields, mapNames(config, "questions", ["questionsDue", "questionDeadline"])),
          ),
          responsesDueAt: parseFlexibleDate(
            pick(fields, mapNames(config, "due", ["dueDate", "closeDate", "responseDate", "bidDueDate"])),
          ),
          estValueBand:
            parseValueBand(pick(fields, mapNames(config, "value", ["estimatedValue", "value", "amount"]))) ??
            null,
          raw: { feed: url, item: fields },
        });
      }
    }
    return notices;
  },
};

/** CSV export. The Texas ESBD shape. */
export const csvConnector: Connector = {
  kind: "csv",
  async fetch(source, now) {
    const config = (source.config ?? {}) as SourceConfig;
    const urls = config.urls ?? [];
    if (urls.length === 0) throw new Error("No CSV URL configured for this source.");

    const notices: RawNotice[] = [];
    for (const [index, url] of urls.entries()) {
      if (index > 0) await sleep(PAGE_DELAY_MS);
      const body = await fetchText(url, "text/csv, text/plain");
      for (const record of parseCsvRecords(body)) {
        const externalId = pick(record, mapNames(config, "id", ["Solicitation ID", "SolicitationNumber", "ID"]));
        const title = pick(record, mapNames(config, "title", ["Title", "Solicitation Title", "Name"]));
        if (!externalId || !title) continue;
        notices.push({
          externalId,
          title,
          agency:
            pick(record, mapNames(config, "agency", ["Agency", "Agency Name", "Entity"])) ||
            config.agencyFallback ||
            source.name,
          state: config.state ?? null,
          naicsCodes: parseCodeList(pick(record, mapNames(config, "naics", ["NAICS", "NAICS Code"]))),
          pscCodes: parseCodeList(pick(record, mapNames(config, "psc", ["Class/Item", "Commodity Code"]))),
          description: htmlToText(
            pick(record, mapNames(config, "description", ["Description", "Summary", "Scope"])),
          ),
          url: pick(record, mapNames(config, "link", ["URL", "Link"])) || url,
          postedAt:
            parseFlexibleDate(pick(record, mapNames(config, "posted", ["Posted Date", "Date Posted"]))) ?? now,
          questionsDueAt: parseFlexibleDate(
            pick(record, mapNames(config, "questions", ["Questions Due", "Question Deadline"])),
          ),
          responsesDueAt: parseFlexibleDate(
            pick(record, mapNames(config, "due", ["Response Due", "Due Date", "Closing Date"])),
          ),
          estValueBand:
            parseValueBand(pick(record, mapNames(config, "value", ["Estimated Value", "Value"]))) ?? null,
          raw: { csv: url, record },
        });
      }
    }
    return notices;
  },
};

/** Scraped listing table. The Washington WEBS shape — selectors from config. */
export const htmlConnector: Connector = {
  kind: "html",
  async fetch(source, now) {
    const config = (source.config ?? {}) as SourceConfig;
    const urls = config.urls ?? [];
    const selectors = config.selectors ?? {};
    if (urls.length === 0) throw new Error("No listing URL configured for this source.");
    if (!selectors.row) throw new Error("No row selector configured for this source.");

    // cheerio is only needed on this path; importing it lazily keeps it out of
    // the app's serverless bundles that never scrape.
    const { load } = await import("cheerio");
    const notices: RawNotice[] = [];

    for (const [index, url] of urls.entries()) {
      if (index > 0) await sleep(PAGE_DELAY_MS);
      const html = await fetchText(url, "text/html");
      const $ = load(html);
      $(selectors.row).each((_i, element) => {
        const row = $(element);
        const text = (selector?: string) =>
          selector ? htmlToText(row.find(selector).first().html() ?? row.find(selector).first().text() ?? "") : "";
        const title = text(selectors.title) || (htmlToText(row.text()).split("\n")[0] ?? "");
        const href = selectors.link ? (row.find(selectors.link).first().attr("href") ?? "") : "";
        const externalId = text(selectors.id) || href || title;
        if (!title || !externalId) return;
        notices.push({
          externalId,
          title,
          agency: text(selectors.agency) || config.agencyFallback || source.name,
          state: config.state ?? null,
          naicsCodes: [],
          pscCodes: [],
          description: text(selectors.description),
          url: href ? new URL(href, url).toString() : url,
          postedAt: now,
          questionsDueAt: parseFlexibleDate(text(selectors.questions)),
          responsesDueAt: parseFlexibleDate(text(selectors.due)),
          estValueBand: null,
          raw: { listing: url, html: row.html()?.slice(0, 2_000) ?? "" },
        });
      });
    }
    return notices;
  },
};

export const CONNECTORS: Record<Source["kind"], Connector> = {
  api: samConnector,
  rss: rssConnector,
  csv: csvConnector,
  html: htmlConnector,
};

/* ------------------------------------------------------------ normalizing */

/**
 * sha256 over the fields a firm would care about changing. `raw` and fetch
 * timestamps are excluded on purpose: a portal that re-serializes its JSON
 * differently every request must not look like an amendment.
 */
export function contentHash(notice: RawNotice): string {
  const canonical = JSON.stringify([
    notice.externalId,
    notice.title.trim(),
    notice.agency.trim(),
    notice.state,
    [...notice.naicsCodes].sort(),
    [...notice.pscCodes].sort(),
    notice.description.trim(),
    notice.url,
    notice.questionsDueAt?.toISOString() ?? null,
    notice.responsesDueAt?.toISOString() ?? null,
    notice.estValueBand ?? null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function normalize(sourceId: string, notice: RawNotice): NewOpportunity {
  return {
    sourceId,
    externalId: notice.externalId.slice(0, 200),
    title: notice.title.slice(0, 600),
    agency: notice.agency.slice(0, 300),
    state: notice.state,
    naicsCodes: notice.naicsCodes,
    pscCodes: notice.pscCodes,
    description: notice.description,
    url: notice.url,
    postedAt: notice.postedAt,
    questionsDueAt: notice.questionsDueAt,
    responsesDueAt: notice.responsesDueAt,
    estValueBand: notice.estValueBand,
    contentHash: contentHash(notice),
    raw: notice.raw as Record<string, unknown>,
  };
}

export type UpsertOutcome = "inserted" | "unchanged" | "amended" | "date_changed" | "cancelled";

export interface UpsertResult {
  opportunityId: string;
  outcome: UpsertOutcome;
  changed: boolean;
}

/**
 * Insert or update by `(source_id, external_id)`.
 *
 * The content hash short-circuits an unchanged notice: no write, no event, no
 * rescore. A changed notice updates **in place** and appends exactly one event
 * — cancelled beats a date change beats a plain amendment — so the trail reads
 * as a history rather than a log of every field diff.
 */
export async function upsertOpportunity(
  sourceId: string,
  notice: RawNotice,
): Promise<UpsertResult> {
  const db = getDb();
  const values = normalize(sourceId, notice);

  const [existing] = await db
    .select()
    .from(opportunities)
    .where(
      and(eq(opportunities.sourceId, sourceId), eq(opportunities.externalId, values.externalId)),
    );

  if (!existing) {
    const [inserted] = await db.insert(opportunities).values(values).returning();
    await db.insert(opportunityEvents).values({
      opportunityId: inserted.id,
      kind: "posted",
      detail: { title: inserted.title, source: sourceId },
      occurredAt: inserted.postedAt,
    });
    return { opportunityId: inserted.id, outcome: "inserted", changed: true };
  }

  if (existing.contentHash === values.contentHash) {
    return { opportunityId: existing.id, outcome: "unchanged", changed: false };
  }

  const cancelled = /\bcancell?ed\b/i.test(values.title) || /\bcancell?ation\b/i.test(values.title);
  const dateDiff = describeDateChange(existing, values);
  const kind: Exclude<UpsertOutcome, "inserted" | "unchanged"> = cancelled
    ? "cancelled"
    : dateDiff
      ? "date_changed"
      : "amended";

  await db
    .update(opportunities)
    .set({
      ...values,
      oppStatus: cancelled ? "cancelled" : existing.oppStatus === "open" ? "amended" : existing.oppStatus,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, existing.id));

  await db.insert(opportunityEvents).values({
    opportunityId: existing.id,
    kind,
    detail: dateDiff ?? { field: "content", note: "Notice text or attachments changed." },
  });

  return { opportunityId: existing.id, outcome: kind, changed: true };
}

function describeDateChange(
  existing: Opportunity,
  values: NewOpportunity,
): Record<string, unknown> | null {
  const changes: Array<{ field: string; old: string | null; new: string | null }> = [];
  const compare = (field: string, before: Date | null | undefined, after: Date | null | undefined) => {
    const a = before ? before.toISOString() : null;
    const b = after ? after.toISOString() : null;
    if (a !== b) changes.push({ field, old: a, new: b });
  };
  compare("responsesDueAt", existing.responsesDueAt, values.responsesDueAt as Date | null);
  compare("questionsDueAt", existing.questionsDueAt, values.questionsDueAt as Date | null);
  return changes.length ? { changes } : null;
}

/* ------------------------------------------------------------ source health */

/**
 * Per-source health, computed from how long the source has actually been
 * failing rather than from a counter that a restart would reset: one missed
 * poll is `degraded`, three intervals without a success is `down`.
 */
export async function markSourceHealth(
  source: Source,
  outcome: "ok" | "failed",
  note: string | null,
  now: Date = new Date(),
): Promise<Source["status"]> {
  const db = getDb();
  if (outcome === "ok") {
    await db
      .update(sources)
      .set({ status: "ok", statusNote: note, lastSuccessAt: now, lastPolledAt: now, updatedAt: now })
      .where(eq(sources.id, source.id));
    return "ok";
  }

  const staleAfterMs = source.pollIntervalMinutes * 60_000 * 3;
  const lastSuccess = source.lastSuccessAt;
  const status: Source["status"] =
    !lastSuccess || now.getTime() - lastSuccess.getTime() > staleAfterMs ? "down" : "degraded";

  await db
    .update(sources)
    .set({ status, statusNote: note, lastPolledAt: now, updatedAt: now })
    .where(eq(sources.id, source.id));
  return status;
}

/* -------------------------------------------------------------- the poll */

export interface PollResult {
  sourceKey: string;
  upserted: number;
  changed: number;
  /** Opportunity ids that were inserted or changed — the rescore fan-out. */
  changedIds: string[];
  status: Source["status"];
  note: string | null;
  /** True when the bundled sample feed stood in for a live fetch. */
  sampled: boolean;
}

/** Whether this source is allowed to fall back to the bundled sample feed. */
function sampleAllowed(config: SourceConfig): boolean {
  return config.sampleFallback === true;
}

export async function pollSource(sourceId: string, now: Date = new Date()): Promise<PollResult> {
  const db = getDb();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source) throw new Error(`No such source: ${sourceId}`);

  const config = (source.config ?? {}) as SourceConfig;
  const connector = CONNECTORS[source.kind];

  let notices: RawNotice[] = [];
  let sampled = false;
  let failure: string | null = null;

  try {
    notices = await connector.fetch(source, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const samples = sampleAllowed(config) ? fixtureNotices(source.key, now) : [];
    if (samples.length > 0) {
      notices = samples;
      sampled = true;
      failure =
        error instanceof MissingCredentialError
          ? `Sample feed — ${message} Showing ${samples.length} bundled sample notices, not live data.`
          : `Sample feed — live fetch failed (${message}). Showing ${samples.length} bundled sample notices, not live data.`;
    } else {
      const status = await markSourceHealth(source, "failed", truncate(message), now);
      return {
        sourceKey: source.key,
        upserted: 0,
        changed: 0,
        changedIds: [],
        status,
        note: truncate(message),
        sampled: false,
      };
    }
  }

  let upserted = 0;
  let changed = 0;
  const changedIds: string[] = [];
  const errors: string[] = [];

  for (const notice of notices) {
    try {
      const result = await upsertOpportunity(source.id, notice);
      upserted += 1;
      if (result.changed) {
        changed += 1;
        changedIds.push(result.opportunityId);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  // A source that half-parsed is degraded, not ok: the number of notices it
  // dropped is exactly the thing a firm needs to know.
  if (errors.length > 0 && !sampled) {
    const note = `Parsed ${upserted} of ${notices.length} notices; ${errors.length} failed (${truncate(errors[0], 120)}).`;
    const status = await markSourceHealth(source, "failed", note, now);
    return { sourceKey: source.key, upserted, changed, changedIds, status, note, sampled };
  }

  // A live state feed that returns 200 and parses to nothing is the classic
  // silent-staleness case: the URL still resolves, the portal has changed its
  // markup or moved the export, and a radar that reports "ok" looks calm while
  // the firm misses everything from that state. Found in testing, where two
  // portals answered with an HTML page where a CSV/RSS body used to be.
  //
  // The federal API is excluded: it is queried over a posted-date window, so
  // zero notices genuinely means "nothing new was posted".
  if (!sampled && notices.length === 0 && source.kind !== "api") {
    // A source that has never once parsed and is allowed samples falls back to
    // them, clearly labelled — that is a development environment with no route
    // to the portal, not a regression. A source that used to work does not: it
    // goes degraded/down with the note, because that is a connector to fix.
    const samples =
      sampleAllowed(config) && !source.lastSuccessAt ? fixtureNotices(source.key, now) : [];
    if (samples.length > 0) {
      notices = samples;
      sampled = true;
      failure = `Sample feed — the live feed answered but parsed 0 notices, and this source has never parsed successfully here. Showing ${samples.length} bundled sample notices, not live data.`;
    } else {
      const note =
        "Fetched successfully but parsed 0 notices — the feed format or URL has probably changed. Connector update needed.";
      const status = await markSourceHealth(source, "failed", note, now);
      return { sourceKey: source.key, upserted: 0, changed: 0, changedIds: [], status, note, sampled };
    }

    for (const notice of notices) {
      try {
        const result = await upsertOpportunity(source.id, notice);
        upserted += 1;
        if (result.changed) {
          changed += 1;
          changedIds.push(result.opportunityId);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (sampled) {
    // Sample data is never "ok". The status stays degraded with the note the
    // radar shows, so nobody mistakes a demo for a live federal feed.
    await db
      .update(sources)
      .set({ status: "degraded", statusNote: failure, lastPolledAt: now, updatedAt: now })
      .where(eq(sources.id, source.id));
    return {
      sourceKey: source.key,
      upserted,
      changed,
      changedIds,
      status: "degraded",
      note: failure,
      sampled: true,
    };
  }

  const status = await markSourceHealth(source, "ok", null, now);
  return { sourceKey: source.key, upserted, changed, changedIds, status, note: null, sampled: false };
}

function truncate(value: string, max = 240): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Sources whose interval has elapsed — the poll scheduler's work list. */
export async function dueSources(now: Date = new Date()): Promise<Source[]> {
  const all = await getDb().select().from(sources);
  return all.filter((source) => {
    if (!source.lastPolledAt) return true;
    return now.getTime() - source.lastPolledAt.getTime() >= source.pollIntervalMinutes * 60_000;
  });
}
