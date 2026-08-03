/**
 * src/lib/verdicts.ts
 *
 * The database side of compliance: load the inputs, run the pure engine, write
 * history.
 *
 * **Display never reads a stored status.** A verdict's truth depends on today's
 * date — a certificate that was compliant last night is expired this morning — so
 * every screen re-derives it from the current template and coverages. The
 * `evaluations` table is history and the chase ladder's transition record, not the
 * dashboard's source of truth. This is deliberate: rendering a status column that
 * a nightly job reconciles is how an invoice ends up displaying "Due" 212 days
 * late.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  certificates,
  coverages,
  engagements,
  evaluations,
  properties,
  requirementTemplates,
  vendors,
  type Certificate,
  type Coverage,
  type Deficiency,
  type Engagement,
  type Org,
  type Property,
  type RequirementTemplate,
  type Vendor,
  type VerdictStatus,
} from "@/db/schema";
import { plainDate } from "@/lib/dates";
import { evaluate, type Verdict } from "@/lib/compliance";
import { holderMatches } from "@/lib/acord";

export interface EngagementView {
  engagement: Engagement;
  vendor: Vendor;
  property: Property;
  template: RequirementTemplate;
  /** The newest certificate that cleared parsing (or human review). */
  certificate: Certificate | null;
  coverages: Coverage[];
  verdict: Verdict;
}

/** Today, as the org's calendar sees it. */
export function orgToday(org: Pick<Org, "timezone">, at: Date = new Date()): string {
  return plainDate(at, org.timezone || "UTC");
}

/** The org's required certificate-holder wording, falling back to its name. */
export function expectedHolder(org: Pick<Org, "name" | "settings">): string {
  return org.settings?.holderName?.trim() || org.name;
}

/**
 * A vendor's current certificate: the newest one with `parsed_status = 'parsed'`.
 * `needs_review` and `failed` certificates are deliberately excluded — that is the
 * "never silently enters compliance" rule, enforced in one place.
 */
export async function currentCertificates(
  orgId: string,
  vendorIds: string[],
): Promise<Map<string, Certificate>> {
  const out = new Map<string, Certificate>();
  if (!vendorIds.length) return out;
  const db = getDb();
  const rows = await db
    .select()
    .from(certificates)
    .where(
      and(
        eq(certificates.orgId, orgId),
        inArray(certificates.vendorId, vendorIds),
        eq(certificates.parsedStatus, "parsed"),
      ),
    )
    .orderBy(desc(certificates.uploadedAt));
  for (const row of rows) {
    if (!out.has(row.vendorId)) out.set(row.vendorId, row);
  }
  return out;
}

export interface ViewFilter {
  vendorId?: string;
  propertyId?: string;
  includeEnded?: boolean;
}

/** Every engagement the org has, with its verdict as of now. */
export async function engagementViews(
  org: Org,
  filter: ViewFilter = {},
  at: Date = new Date(),
): Promise<EngagementView[]> {
  const db = getDb();
  const conditions = [eq(vendors.orgId, org.id)];
  if (!filter.includeEnded) conditions.push(eq(engagements.status, "active"));
  if (filter.vendorId) conditions.push(eq(engagements.vendorId, filter.vendorId));
  if (filter.propertyId) conditions.push(eq(engagements.propertyId, filter.propertyId));

  const rows = await db
    .select({
      engagement: engagements,
      vendor: vendors,
      property: properties,
      template: requirementTemplates,
    })
    .from(engagements)
    .innerJoin(vendors, eq(vendors.id, engagements.vendorId))
    .innerJoin(properties, eq(properties.id, engagements.propertyId))
    .innerJoin(
      requirementTemplates,
      eq(requirementTemplates.id, engagements.requirementTemplateId),
    )
    .where(and(...conditions))
    .orderBy(vendors.name, properties.name);

  if (!rows.length) return [];

  const certByVendor = await currentCertificates(
    org.id,
    [...new Set(rows.map((r) => r.vendor.id))],
  );
  const certIds = [...new Set([...certByVendor.values()].map((c) => c.id))];
  const coverageRows = certIds.length
    ? await db.select().from(coverages).where(inArray(coverages.certificateId, certIds))
    : [];
  const coveragesByCert = new Map<string, Coverage[]>();
  for (const row of coverageRows) {
    const list = coveragesByCert.get(row.certificateId) ?? [];
    list.push(row);
    coveragesByCert.set(row.certificateId, list);
  }

  const today = orgToday(org, at);
  const holder = expectedHolder(org);

  return rows.map((row) => {
    const certificate = certByVendor.get(row.vendor.id) ?? null;
    const certCoverages = certificate ? (coveragesByCert.get(certificate.id) ?? []) : [];
    const verdict = evaluate({
      template: { lines: row.template.lines, flags: row.template.flags },
      coverages: certificate ? certCoverages : null,
      holder: certificate
        ? {
            found: certificate.holderName,
            ok:
              certificate.holderOk ??
              holderMatches(certificate.holderName, holder),
            expected: holder,
          }
        : undefined,
      today,
    });
    return { ...row, certificate, coverages: certCoverages, verdict };
  });
}

/** One engagement's view, or null. */
export async function engagementView(
  org: Org,
  engagementId: string,
  at: Date = new Date(),
): Promise<EngagementView | null> {
  const all = await engagementViews(org, { includeEnded: true }, at);
  return all.find((v) => v.engagement.id === engagementId) ?? null;
}

/* ------------------------------------------------------------------ rollups */

export interface Rollup {
  total: number;
  compliant: number;
  expiring: number;
  deficient: number;
  expired: number;
  missing: number;
  /** Engagements a work order must be held for. */
  blocked: number;
}

export function rollup(views: EngagementView[]): Rollup {
  const r: Rollup = {
    total: views.length,
    compliant: 0,
    expiring: 0,
    deficient: 0,
    expired: 0,
    missing: 0,
    blocked: 0,
  };
  for (const v of views) {
    r[v.verdict.status] += 1;
    if (v.verdict.status !== "compliant" && v.verdict.status !== "expiring") r.blocked += 1;
  }
  return r;
}

/** Engagements whose coverage lapses inside `days` — the "this month" list. */
export function lapsingWithin(views: EngagementView[], days: number): EngagementView[] {
  return views
    .filter(
      (v) =>
        v.verdict.daysToExpiry != null &&
        v.verdict.daysToExpiry >= 0 &&
        v.verdict.daysToExpiry <= days,
    )
    .sort((a, b) => (a.verdict.daysToExpiry ?? 0) - (b.verdict.daysToExpiry ?? 0));
}

/* ------------------------------------------------------------------ history */

export interface StoredVerdict {
  status: VerdictStatus;
  deficiencies: Deficiency[];
  certificateId: string | null;
  evaluatedAt: Date;
}

export async function latestEvaluations(
  engagementIds: string[],
): Promise<Map<string, StoredVerdict>> {
  const out = new Map<string, StoredVerdict>();
  if (!engagementIds.length) return out;
  const db = getDb();
  const rows = await db
    .select()
    .from(evaluations)
    .where(inArray(evaluations.engagementId, engagementIds))
    .orderBy(desc(evaluations.evaluatedAt));
  for (const row of rows) {
    if (!out.has(row.engagementId)) {
      out.set(row.engagementId, {
        status: row.status,
        deficiencies: row.deficiencies,
        certificateId: row.certificateId,
        evaluatedAt: row.evaluatedAt,
      });
    }
  }
  return out;
}

export async function evaluationHistory(engagementId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(evaluations)
    .where(eq(evaluations.engagementId, engagementId))
    .orderBy(desc(evaluations.evaluatedAt))
    .limit(limit);
}

function sameVerdict(a: StoredVerdict | undefined, b: EngagementView): boolean {
  if (!a) return false;
  if (a.status !== b.verdict.status) return false;
  if (a.certificateId !== (b.certificate?.id ?? null)) return false;
  const left = a.deficiencies.map((d) => d.reason).join("|");
  const right = b.verdict.deficiencies.map((d) => d.reason).join("|");
  return left === right;
}

export interface PersistResult {
  written: number;
  transitions: Array<{
    engagementId: string;
    from: VerdictStatus | null;
    to: VerdictStatus;
  }>;
}

/**
 * Write an `evaluations` row for every engagement whose verdict has actually
 * changed. Re-running this on an unchanged portfolio writes nothing, so the
 * nightly pass does not grow the history by one row per engagement per day.
 */
export async function persistEvaluations(
  org: Org,
  views?: EngagementView[],
  at: Date = new Date(),
): Promise<PersistResult> {
  const list = views ?? (await engagementViews(org, {}, at));
  if (!list.length) return { written: 0, transitions: [] };

  const previous = await latestEvaluations(list.map((v) => v.engagement.id));
  const rows: Array<typeof evaluations.$inferInsert> = [];
  const transitions: PersistResult["transitions"] = [];

  for (const view of list) {
    const prior = previous.get(view.engagement.id);
    if (sameVerdict(prior, view)) continue;
    rows.push({
      engagementId: view.engagement.id,
      certificateId: view.certificate?.id ?? null,
      status: view.verdict.status,
      deficiencies: view.verdict.deficiencies,
      evaluatedAt: at,
    });
    transitions.push({
      engagementId: view.engagement.id,
      from: prior?.status ?? null,
      to: view.verdict.status,
    });
  }

  if (rows.length) {
    const db = getDb();
    await db.insert(evaluations).values(rows);
  }
  return { written: rows.length, transitions };
}

/** Re-evaluate one vendor's engagements — called after a review confirmation. */
export async function persistForVendor(org: Org, vendorId: string, at: Date = new Date()) {
  const views = await engagementViews(org, { vendorId }, at);
  return persistEvaluations(org, views, at);
}

/* ------------------------------------------------------------ blast radius */

/**
 * What a template edit would do, before it is saved (DESIGN.md screen 5). Runs the
 * engine twice over the same engagements: once with the saved template, once with
 * the draft.
 */
export interface BlastRadiusRow {
  engagementId: string;
  vendorName: string;
  propertyName: string;
  from: VerdictStatus;
  to: VerdictStatus;
  newDeficiencies: Deficiency[];
}

export async function blastRadius(
  org: Org,
  templateId: string,
  draft: { lines: RequirementTemplate["lines"]; flags: RequirementTemplate["flags"] },
  at: Date = new Date(),
): Promise<{ affected: BlastRadiusRow[]; checked: number }> {
  const views = (await engagementViews(org, {}, at)).filter(
    (v) => v.engagement.requirementTemplateId === templateId,
  );
  const today = orgToday(org, at);
  const holder = expectedHolder(org);
  const affected: BlastRadiusRow[] = [];

  for (const view of views) {
    const after = evaluate({
      template: draft,
      coverages: view.certificate ? view.coverages : null,
      holder: view.certificate
        ? {
            found: view.certificate.holderName,
            ok: view.certificate.holderOk ?? holderMatches(view.certificate.holderName, holder),
            expected: holder,
          }
        : undefined,
      today,
    });
    const before = view.verdict;
    const changed =
      before.status !== after.status ||
      before.deficiencies.map((d) => d.reason).join("|") !==
        after.deficiencies.map((d) => d.reason).join("|");
    if (!changed) continue;
    const priorReasons = new Set(before.deficiencies.map((d) => d.reason));
    affected.push({
      engagementId: view.engagement.id,
      vendorName: view.vendor.name,
      propertyName: view.property.name,
      from: before.status,
      to: after.status,
      newDeficiencies: after.deficiencies.filter((d) => !priorReasons.has(d.reason)),
    });
  }

  return { affected, checked: views.length };
}
