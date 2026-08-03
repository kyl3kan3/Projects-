import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { kioskDevices, programs, ranks, students } from "@/db/schema";
import { ScreenTitle } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { CURRICULUM_TEMPLATES } from "@/lib/curricula";
import { SetupCards } from "./SetupCards";

export const metadata: Metadata = { title: "First run" };

/**
 * First run, per DESIGN.md: three cards — pick a curriculum template, import
 * students, set up the kiosk — ending with a sample grading event assembled from
 * the imported data. The cards show what is already done rather than resetting to
 * step one every visit, because setup happens over an evening, not in one sitting.
 */
export default async function SetupPage() {
  const { school } = await requireSchool();
  const db = getDb();

  const programList = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(and(eq(programs.schoolId, school.id), eq(programs.status, "active")))
    .orderBy(asc(programs.name));

  const [studentRow] = await db
    .select({ n: count() })
    .from(students)
    .where(eq(students.schoolId, school.id));

  const [deviceRow] = await db
    .select({ n: count() })
    .from(kioskDevices)
    .where(and(eq(kioskDevices.schoolId, school.id), eq(kioskDevices.status, "active")));

  const rankCounts = new Map<string, number>();
  for (const program of programList) {
    const [row] = await db
      .select({ n: count() })
      .from(ranks)
      .where(eq(ranks.programId, program.id));
    rankCounts.set(program.id, Number(row?.n ?? 0));
  }

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Setup"
        title="Three things, one evening"
        action={
          <Link href="/roster" className="btn-quiet">
            Skip
          </Link>
        }
      />
      <p className="t-secondary">
        A curriculum, a roster, and the tablet by the door. Then MatPass assembles your first
        grading list on its own — that is the moment the whiteboard loses.
      </p>

      <SetupCards
        templates={CURRICULUM_TEMPLATES.map((t) => ({
          key: t.key,
          program: t.program,
          description: t.description,
          rankCount: t.ranks.length,
          topRank: t.ranks[t.ranks.length - 1].name,
        }))}
        programs={programList.map((p) => ({
          id: p.id,
          name: p.name,
          rankCount: rankCounts.get(p.id) ?? 0,
        }))}
        studentCount={Number(studentRow?.n ?? 0)}
        deviceCount={Number(deviceRow?.n ?? 0)}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3057"}
      />
    </main>
  );
}
