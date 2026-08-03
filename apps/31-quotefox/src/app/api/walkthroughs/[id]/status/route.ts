/**
 * GET /api/walkthroughs/:id/status — what the pipeline is doing right now.
 *
 * The capture screen polls this while the draft resolves, so the contractor sees
 * "transcribing" and then "drafting" instead of a spinner with no promise attached.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { estimates } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { describeFailure, getWalkthrough } from "@/lib/walkthroughs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const found = await getWalkthrough(ctx.org.id, id);
  if (!found) return Response.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  const [estimate] = await db
    .select({ id: estimates.id })
    .from(estimates)
    .where(and(eq(estimates.organizationId, ctx.org.id), eq(estimates.walkthroughId, id)))
    .orderBy(desc(estimates.version))
    .limit(1);

  return Response.json({
    status: found.walkthrough.status,
    failureReason: found.walkthrough.failureReason,
    failureMessage: found.walkthrough.failureReason
      ? describeFailure(found.walkthrough.failureReason)
      : null,
    estimateId: estimate?.id ?? null,
    media: found.media.map((media) => ({
      id: media.id,
      kind: media.kind,
      sequence: media.sequence,
      uploadStatus: media.uploadStatus,
      sizeBytes: media.sizeBytes,
    })),
  });
}
