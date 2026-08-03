/**
 * Certificate data for a completed grading event: name, rank, date, grader.
 *
 * CSV by default because that is what a school pastes into whatever certificate
 * template it already owns; `?format=pdf` renders a printable sheet with pdf-lib
 * for schools that want one file to hand to the printer.
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { enrollments, gradingEvents, promotions, ranks, students, users } from "@/db/schema";
import { requireSchool } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { dayKey, formatDay } from "@/lib/time";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { school } = await requireSchool();
  const { eventId } = await params;
  const db = getDb();

  const [event] = await db
    .select()
    .from(gradingEvents)
    .where(and(eq(gradingEvents.id, eventId), eq(gradingEvents.schoolId, school.id)));
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db
    .select({
      firstName: students.firstName,
      lastName: students.lastName,
      rankName: ranks.name,
      stripes: promotions.toStripes,
      promotedOn: promotions.promotedOn,
      graderName: users.name,
    })
    .from(promotions)
    .innerJoin(enrollments, eq(enrollments.id, promotions.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(ranks, eq(ranks.id, promotions.toRankId))
    .leftJoin(users, eq(users.id, promotions.gradedBy))
    .where(eq(promotions.gradingEventId, eventId))
    .orderBy(asc(students.lastName), asc(students.firstName));

  const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const format = req.nextUrl.searchParams.get("format");

  if (format === "pdf") {
    const pdf = await renderPdf({
      schoolName: school.name,
      eventName: event.name,
      heldOn: formatDay(dayKey(event.heldOn, school.timezone)),
      rows: rows.map((r) => ({
        name: `${r.firstName} ${r.lastName}`,
        rank: r.rankName,
        stripes: r.stripes,
        date: formatDay(dayKey(r.promotedOn, school.timezone)),
        grader: r.graderName ?? "",
      })),
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${slug || "grading"}-certificates.pdf"`,
      },
    });
  }

  const csv = toCsv(
    ["Student", "Rank", "Stripes", "Date", "Grader", "Event", "School"],
    rows.map((r) => [
      `${r.firstName} ${r.lastName}`,
      r.rankName,
      r.stripes,
      dayKey(r.promotedOn, school.timezone),
      r.graderName ?? "",
      event.name,
      school.name,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug || "grading"}-certificates.csv"`,
    },
  });
}

async function renderPdf(input: {
  schoolName: string;
  eventName: string;
  heldOn: string;
  rows: { name: string; rank: string; stripes: number; date: string; grader: string }[];
}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.149, 0.141, 0.129);
  const faint = rgb(0.451, 0.435, 0.404);

  const perPage = 24;
  const pages = Math.max(1, Math.ceil(input.rows.length / perPage));

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595, 842]); // A4
    let y = 780;
    page.drawText(input.schoolName, { x: 48, y, size: 18, font: bold, color: ink });
    y -= 22;
    page.drawText(`${input.eventName} — ${input.heldOn}`, {
      x: 48,
      y,
      size: 11,
      font: regular,
      color: faint,
    });
    y -= 32;
    page.drawText("STUDENT", { x: 48, y, size: 8, font: bold, color: faint });
    page.drawText("RANK", { x: 250, y, size: 8, font: bold, color: faint });
    page.drawText("DATE", { x: 420, y, size: 8, font: bold, color: faint });
    y -= 6;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 0.5, color: faint });
    y -= 18;

    for (const row of input.rows.slice(p * perPage, (p + 1) * perPage)) {
      page.drawText(row.name, { x: 48, y, size: 11, font: regular, color: ink });
      page.drawText(
        `${row.rank}${row.stripes > 0 ? ` · ${row.stripes} stripe${row.stripes === 1 ? "" : "s"}` : ""}`,
        { x: 250, y, size: 11, font: regular, color: ink },
      );
      page.drawText(row.date, { x: 420, y, size: 10, font: regular, color: faint });
      y -= 22;
    }

    if (input.rows.length === 0) {
      page.drawText("No promotions were recorded at this event.", {
        x: 48,
        y,
        size: 11,
        font: regular,
        color: faint,
      });
    }
  }

  return doc.save();
}
