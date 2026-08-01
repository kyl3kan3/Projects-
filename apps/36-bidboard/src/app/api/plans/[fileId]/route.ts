import { NextResponse, type NextRequest } from "next/server";
import { currentContext } from "@/lib/auth";
import { planFileFor, readPlanFile } from "@/lib/plan-files";

/** An estimator downloading their own plan set. Scoped by session, then by company. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const ctx = await currentContext();
  if (!ctx) return new NextResponse("Sign in first", { status: 401 });

  const { fileId } = await params;
  const file = await planFileFor(ctx.company.id, fileId);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const object = await readPlanFile(file);
  if (!object) return new NextResponse("That file is no longer stored", { status: 410 });

  return new NextResponse(new Uint8Array(object.data), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
