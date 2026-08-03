/**
 * Attendance export: one CSV row per signature, per crew, per date range.
 *
 * This is what a GC prequal questionnaire actually wants, and what a customer
 * takes with them if they leave. Their records are theirs — an export path that
 * only exists for churn is not a feature, it is a promise.
 */

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, crews, employees, signOffs, talkInstances, talks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { company, user } = await requireUser();
  const url = new URL(req.url);
  const today = todayIso(company.timezone);
  const from = url.searchParams.get("from") ?? addDays(today, -365);
  const to = url.searchParams.get("to") ?? today;
  const crewId = url.searchParams.get("crew");

  const db = getDb();
  const clauses = [
    eq(talkInstances.companyId, company.id),
    gte(talkInstances.scheduledFor, from),
    lte(talkInstances.scheduledFor, to),
  ];
  if (crewId) clauses.push(eq(talkInstances.crewId, crewId));

  const rows = await db
    .select({
      scheduledFor: talkInstances.scheduledFor,
      crewName: crews.name,
      siteLabel: crews.siteLabel,
      talkTitle: talks.title,
      status: talkInstances.status,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
      signedAt: signOffs.signedAt,
      syncedAt: signOffs.syncedAt,
      capturedOffline: signOffs.capturedOffline,
      deviceId: signOffs.deviceId,
    })
    .from(signOffs)
    .innerJoin(talkInstances, eq(talkInstances.id, signOffs.talkInstanceId))
    .innerJoin(crews, eq(crews.id, talkInstances.crewId))
    .innerJoin(talks, eq(talks.id, talkInstances.talkId))
    .innerJoin(employees, eq(employees.id, signOffs.employeeId))
    .where(and(...clauses))
    .orderBy(asc(talkInstances.scheduledFor), asc(employees.name));

  const header = [
    "date_scheduled",
    "crew",
    "site",
    "talk",
    "employee",
    "job_title",
    "signed_at_device",
    "synced_at_server",
    "captured_offline",
    "device_id",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.scheduledFor,
        r.crewName,
        r.siteLabel ?? "",
        r.talkTitle,
        r.employeeName,
        r.jobTitle ?? "",
        r.signedAt.toISOString(),
        r.syncedAt.toISOString(),
        r.capturedOffline ? "yes" : "no",
        r.deviceId,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  await db.insert(auditLog).values({
    companyId: company.id,
    actor: user.email,
    action: "attendance.export",
    metadata: { from, to, rows: rows.length, crewId },
  });

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendance-${from}-to-${to}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
