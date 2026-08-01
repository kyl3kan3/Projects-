/** The incident file as one document: the account, the people, their waivers. */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { incidentFilePdf } from "@/lib/pdf";
import { featureAllowed } from "@/lib/plans";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!featureAllowed(ctx.account, "incidents")) {
    return NextResponse.json({ error: "Incidents are part of Front Desk" }, { status: 402 });
  }

  const rendered = await incidentFilePdf(ctx.account.id, id, { userId: ctx.user.id });
  if (!rendered) return NextResponse.json({ error: "No such incident" }, { status: 404 });

  return new NextResponse(Buffer.from(rendered.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${rendered.filename}"`,
    },
  });
}
