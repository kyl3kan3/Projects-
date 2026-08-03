/**
 * Roster export: every student with their rank, stripes, progress toward the next
 * step, cadence and household. The CSV a school takes to a federation, an
 * insurer, or its accountant.
 */

import { NextResponse } from "next/server";
import { requireSchool } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { loadRoster } from "@/lib/roster";

export async function GET() {
  const { school } = await requireSchool();
  const entries = await loadRoster({
    schoolId: school.id,
    timezone: school.timezone,
    includeInactive: true,
  });

  const rows: (string | number)[][] = [];
  for (const entry of entries) {
    if (entry.programs.length === 0) {
      rows.push([entry.name, entry.familyName, entry.status, "", "", "", "", "", "", entry.cadenceLabel]);
      continue;
    }
    for (const program of entry.programs) {
      rows.push([
        entry.name,
        entry.familyName,
        entry.status,
        program.programName,
        program.rankName,
        program.stripesEarned,
        program.stripesTotal,
        `${program.progress.classesDone}/${program.progress.classesRequired}`,
        `${program.progress.daysDone}/${program.progress.daysRequired}`,
        entry.cadenceLabel,
        program.progress.eligible ? "eligible" : program.progress.missing.join("; "),
        entry.flagged ? "flagged" : "",
        entry.billingState,
        entry.kioskPin ?? "",
      ]);
    }
  }

  const csv = toCsv(
    [
      "Student",
      "Household",
      "Status",
      "Program",
      "Rank",
      "Stripes",
      "Stripes in rank",
      "Classes toward next",
      "Days toward next",
      "Cadence",
      "Eligibility",
      "Retention",
      "Billing",
      "Kiosk PIN",
    ],
    rows,
  );

  const slug = school.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug || "school"}-roster.csv"`,
    },
  });
}
