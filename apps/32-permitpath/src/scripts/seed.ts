/**
 * Seed the shared corpus: 50 jurisdictions, their monitored sources, and a
 * verified requirement record for every job type each of them covers — plus the
 * version chains, the review queue, and the one broken source that make the
 * corpus look like what it is: something maintained, not generated.
 *
 * Idempotent. Re-running updates jurisdiction and source metadata and leaves
 * existing requirement records alone, because a record is a versioned fact with a
 * verifier's name on it and a seed script has no business overwriting one.
 *
 * Usage:
 *   npm run db:seed
 *   npm run db:seed -- --curator=you@example.com     # grant console access
 */

import "@/lib/load-env";
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  jurisdictionSources,
  jurisdictions,
  requirementChanges,
  requirementRecords,
  users,
  type FeeLine,
  type SubmittalRequirement,
} from "@/db/schema";
import { JURISDICTION_SEEDS, composeRecords } from "@/lib/corpus";
import {
  SEEDED_BROKEN_SOURCES,
  SEEDED_PENDING_DIFFS,
  SEEDED_VERSION_CHANGES,
} from "@/lib/corpus/history";

const DAY_MS = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

async function main(): Promise<void> {
  const db = getDb();
  const curatorFlag = process.argv.find((a) => a.startsWith("--curator="));

  let jurisdictionCount = 0;
  let sourceCount = 0;
  let recordCount = 0;
  let versionCount = 0;

  for (const [index, seed] of JURISDICTION_SEEDS.entries()) {
    const [jurisdiction] = await db
      .insert(jurisdictions)
      .values({
        name: seed.name,
        slug: seed.slug,
        state: seed.state,
        county: seed.county,
        kind: seed.kind,
        departmentName: seed.departmentName,
        contact: seed.contact,
        portalUrl: seed.portalUrl ?? null,
        coverageStatus: seed.coverage,
        permitValidDays: seed.permitValidDays,
        permitExpiryBasis: seed.permitExpiryBasis,
        curatedAt: daysAgo(90 + index),
      })
      .onConflictDoUpdate({
        target: jurisdictions.slug,
        set: {
          name: seed.name,
          departmentName: seed.departmentName,
          contact: seed.contact,
          portalUrl: seed.portalUrl ?? null,
          coverageStatus: seed.coverage,
          permitValidDays: seed.permitValidDays,
          permitExpiryBasis: seed.permitExpiryBasis,
        },
      })
      .returning();
    jurisdictionCount += 1;

    /* --- monitored sources ------------------------------------------- */
    const sourceIds: string[] = [];
    for (const [sourceIndex, source] of seed.sources.entries()) {
      const [existing] = await db
        .select()
        .from(jurisdictionSources)
        .where(
          and(
            eq(jurisdictionSources.jurisdictionId, jurisdiction.id),
            eq(jurisdictionSources.url, source.url),
          ),
        );
      if (existing) {
        sourceIds.push(existing.id);
        continue;
      }
      const [row] = await db
        .insert(jurisdictionSources)
        .values({
          jurisdictionId: jurisdiction.id,
          url: source.url,
          label: source.label,
          selector: source.selector ?? null,
          crawlFrequencyHours: 72,
          // Staggered so the crawl queue does not stampede on first tick.
          lastCrawledAt: daysAgo(1 + ((index + sourceIndex) % 4)),
        })
        .returning();
      sourceIds.push(row.id);
      sourceCount += 1;
    }

    /* --- requirement records ----------------------------------------- */
    for (const composed of composeRecords(seed, index)) {
      const [current] = await db
        .select({ id: requirementRecords.id })
        .from(requirementRecords)
        .where(
          and(
            eq(requirementRecords.jurisdictionId, jurisdiction.id),
            eq(requirementRecords.jobType, composed.jobType),
            isNull(requirementRecords.supersededBy),
          ),
        );
      if (current) continue;

      const history = SEEDED_VERSION_CHANGES.find(
        (c) => c.jurisdictionSlug === seed.slug && c.jobType === composed.jobType,
      );
      const sourceId = sourceIds[composed.sourceIndex] ?? sourceIds[0] ?? null;

      // The current version goes in first. Inserting the superseded row first
      // would briefly leave two rows with superseded_by IS NULL for the same
      // (jurisdiction, job type) — which the partial unique index rejects, and
      // rightly so.
      const [newest] = await db
        .insert(requirementRecords)
        .values({
          jurisdictionId: jurisdiction.id,
          jobType: composed.jobType,
          permitsRequired: composed.permitsRequired,
          submittalRequirements: composed.submittalRequirements,
          fees: composed.fees,
          reviewTimeline: composed.reviewTimeline,
          quirks: composed.quirks,
          inspectionSequence: composed.inspectionSequence,
          inspectionContact: composed.inspectionContact,
          inspectionLeadTimeDays: composed.inspectionLeadTimeDays,
          reinspectionFeeCents: composed.reinspectionFeeCents,
          version: history ? 2 : 1,
          sourceId,
          sourceKind: "official_page",
          verifiedAt: daysAgo(history ? history.daysAgo : composed.verifiedDaysAgo),
          verifiedBy: history ? history.reviewedBy : composed.verifiedBy,
        })
        .returning();
      recordCount += 1;

      if (!history) continue;

      const previousFees: FeeLine[] = history.previous.fees ?? composed.fees;
      const previousSubmittals: SubmittalRequirement[] = history.previous.submittalTitleRemoved
        ? composed.submittalRequirements.filter(
            (s) => s.title !== history.previous.submittalTitleRemoved,
          )
        : composed.submittalRequirements;

      const [previous] = await db
        .insert(requirementRecords)
        .values({
          jurisdictionId: jurisdiction.id,
          jobType: composed.jobType,
          permitsRequired: composed.permitsRequired,
          submittalRequirements: previousSubmittals,
          fees: previousFees,
          reviewTimeline: history.previous.reviewTimeline ?? composed.reviewTimeline,
          quirks:
            history.previous.quirks === undefined ? composed.quirks : history.previous.quirks,
          inspectionSequence: composed.inspectionSequence,
          inspectionContact: composed.inspectionContact,
          inspectionLeadTimeDays: composed.inspectionLeadTimeDays,
          reinspectionFeeCents: composed.reinspectionFeeCents,
          version: 1,
          sourceId,
          sourceKind: "official_page",
          verifiedAt: daysAgo(history.daysAgo + 120),
          verifiedBy: history.reviewedBy,
          supersededBy: newest.id,
        })
        .returning();

      await db.insert(requirementChanges).values({
        jurisdictionId: jurisdiction.id,
        requirementRecordId: newest.id,
        previousRecordId: previous.id,
        sourceId,
        jobType: composed.jobType,
        origin: "crawl_diff",
        diffSummary: history.summary,
        rawDiff: history.rawDiff,
        reviewState: "approved",
        reviewedAt: daysAgo(history.daysAgo),
        alertedAt: daysAgo(history.daysAgo),
      });
      versionCount += 1;
    }
  }

  /* --- the review queue and the broken source ------------------------ */
  let pendingCount = 0;
  for (const pending of SEEDED_PENDING_DIFFS) {
    const [jurisdiction] = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.slug, pending.jurisdictionSlug));
    if (!jurisdiction) continue;

    const [existing] = await db
      .select({ id: requirementChanges.id })
      .from(requirementChanges)
      .where(
        and(
          eq(requirementChanges.jurisdictionId, jurisdiction.id),
          eq(requirementChanges.diffSummary, pending.summary),
        ),
      );
    if (existing) continue;

    const sources = await db
      .select()
      .from(jurisdictionSources)
      .where(eq(jurisdictionSources.jurisdictionId, jurisdiction.id));
    const source = sources.find((s) => s.label === pending.sourceLabel) ?? sources[0];

    await db.insert(requirementChanges).values({
      jurisdictionId: jurisdiction.id,
      sourceId: source?.id ?? null,
      jobType: pending.jobType,
      origin: "crawl_diff",
      diffSummary: pending.summary,
      rawDiff: pending.rawDiff,
      reviewState: "pending",
      createdAt: daysAgo(pending.daysAgo),
    });
    pendingCount += 1;
  }

  for (const broken of SEEDED_BROKEN_SOURCES) {
    const [jurisdiction] = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.slug, broken.jurisdictionSlug));
    if (!jurisdiction) continue;
    const sources = await db
      .select()
      .from(jurisdictionSources)
      .where(eq(jurisdictionSources.jurisdictionId, jurisdiction.id));
    const source = sources.find((s) => s.label === broken.sourceLabel) ?? sources[0];
    if (!source) continue;
    await db
      .update(jurisdictionSources)
      .set({ status: "broken", failureCount: 3, lastError: broken.error })
      .where(eq(jurisdictionSources.id, source.id));
  }

  if (curatorFlag) {
    const email = curatorFlag.slice("--curator=".length).trim().toLowerCase();
    const updated = await db
      .update(users)
      .set({ isCurator: true })
      .where(eq(users.email, email))
      .returning({ email: users.email });
    console.log(
      updated.length
        ? `Granted curation console access to ${updated[0].email}`
        : `No user with email ${email} — sign up first, then re-run with --curator=`,
    );
  }

  console.log(
    `Corpus seeded: ${jurisdictionCount} jurisdictions, ${sourceCount} new sources, ` +
      `${recordCount} new requirement records (${versionCount} with version history), ` +
      `${pendingCount} diffs in the review queue.`,
  );
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
