/**
 * Signed notes over a date range, as one PDF — the records-request export.
 * Defaults to the last 90 days; `?from=&to=` accept practice-local dates.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { noteWithChain, signedNotesInRange } from "@/lib/notes";
import { notePdf } from "@/lib/pdf";
import { recordAudit } from "@/lib/audit";
import { requestMeta } from "@/lib/request";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const auth = await currentContext();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const to = url.searchParams.get("to")
    ? new Date(`${url.searchParams.get("to")}T23:59:59.999Z`)
    : new Date();
  const from = url.searchParams.get("from")
    ? new Date(`${url.searchParams.get("from")}T00:00:00.000Z`)
    : new Date(to.getTime() - 90 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  }

  const rows = await signedNotesInRange(auth.practice.id, from, to);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No signed notes in that range yet." },
      { status: 404 },
    );
  }

  const entries = [];
  for (const row of rows.slice(0, 200)) {
    const found = await noteWithChain(auth.practice.id, row.noteId);
    if (found) entries.push(found);
  }

  const bytes = await notePdf(entries, {
    timeZone: auth.practice.timezone,
    practiceName: auth.practice.name,
    signerName: auth.user.name,
  });

  const meta = await requestMeta();
  await recordAudit({
    practiceId: auth.practice.id,
    actorId: auth.user.id,
    action: "exported",
    targetKind: "note_range",
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      exportKind: "range_pdf",
      count: entries.length,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="signed-notes-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
