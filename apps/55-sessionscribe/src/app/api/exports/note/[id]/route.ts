/**
 * Signed-note PDF, one note. Audited as an export, because a records request
 * leaving the building is exactly the kind of event an audit log exists for.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { noteWithChain } from "@/lib/notes";
import { notePdf } from "@/lib/pdf";
import { recordAudit } from "@/lib/audit";
import { requestMeta } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctxParams: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await currentContext();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctxParams.params;

  const found = await noteWithChain(auth.practice.id, id);
  if (!found) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const bytes = await notePdf([found], {
    timeZone: auth.practice.timezone,
    practiceName: auth.practice.name,
    signerName: auth.user.name,
  });

  const meta = await requestMeta();
  await recordAudit({
    practiceId: auth.practice.id,
    actorId: auth.user.id,
    action: "exported",
    targetKind: "note",
    targetId: id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { exportKind: "note_pdf", version: found.ctx.note.currentVersion },
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="note-${id.slice(0, 8)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
