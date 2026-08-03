import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { enrollments, programs, ranks } from "@/db/schema";
import { Empty, ScreenTitle } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { CurriculumEditor } from "./CurriculumEditor";

export const metadata: Metadata = { title: "Curriculum" };

export default async function CurriculumPage() {
  const { school, user } = await requireSchool();
  const db = getDb();

  const programList = await db
    .select({ id: programs.id, name: programs.name, description: programs.description })
    .from(programs)
    .where(and(eq(programs.schoolId, school.id), eq(programs.status, "active")))
    .orderBy(asc(programs.name));

  const ladders: Record<string, Awaited<ReturnType<typeof loadLadder>>> = {};
  for (const program of programList) {
    ladders[program.id] = await loadLadder(program.id);
  }

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Programs and ranks"
        title="Curriculum"
        action={
          <Link href="/settings" className="btn-quiet">
            Settings
          </Link>
        }
      />
      <p className="t-secondary">
        The ladder drives everything: eligibility, grading lists, every progress bar. Requirements are
        per rank — stripes split them into equal steps, so a 100-class blue belt with four stripes
        wants 20 classes a stripe.
      </p>

      {programList.length === 0 ? (
        <Empty
          title="No programs yet"
          body="Load a template for your style — BJJ adult or kids, karate, taekwondo, judo — and the whole ladder exists with requirements a real school would recognise."
          action={
            <Link href="/setup" className="btn btn-primary">
              Load a curriculum template
            </Link>
          }
        />
      ) : (
        <CurriculumEditor
          canEdit={user.role !== "front_desk"}
          programs={programList.map((program) => ({
            id: program.id,
            name: program.name,
            description: program.description,
            ranks: ladders[program.id],
          }))}
        />
      )}
    </main>
  );
}

async function loadLadder(programId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(ranks)
    .where(eq(ranks.programId, programId))
    .orderBy(asc(ranks.displayOrder));

  const holders = await db
    .select({ rankId: enrollments.currentRankId, n: count() })
    .from(enrollments)
    .where(eq(enrollments.programId, programId))
    .groupBy(enrollments.currentRankId);
  const byRank = new Map(holders.map((h) => [h.rankId, Number(h.n)]));

  return rows.map((rank) => ({
    id: rank.id,
    name: rank.name,
    displayOrder: rank.displayOrder,
    beltColorHex: rank.beltColorHex,
    stripes: rank.stripes,
    minClasses: rank.minClasses,
    minDaysInRank: rank.minDaysInRank,
    requiresSignoff: rank.requiresSignoff,
    holders: byRank.get(rank.id) ?? 0,
  }));
}
