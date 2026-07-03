import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { currentContext } from "@/lib/auth";
import { getDb } from "@/db";
import { textOutputs, projects, type TextOutputContent } from "@/db/schema";

const citation = z.object({ quote: z.string(), timestampMs: z.number().int().nonnegative() });
const contentSchema: z.ZodType<TextOutputContent> = z.union([
  z.object({ type: z.literal("tweet_thread"), tweets: z.array(z.string()), citations: z.array(citation) }),
  z.object({ type: z.literal("linkedin_post"), body: z.string(), citations: z.array(citation) }),
  z.object({ type: z.literal("newsletter"), markdown: z.string(), citations: z.array(citation) }),
]);

/** Persist a user's edits to a written asset (thread / LinkedIn / newsletter). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = z.object({ content: contentSchema }).safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid content" }, { status: 400 });
  }

  const db = getDb();
  // Ownership check via the parent project.
  const [row] = await db
    .select({ id: textOutputs.id })
    .from(textOutputs)
    .innerJoin(projects, eq(textOutputs.projectId, projects.id))
    .where(and(eq(textOutputs.id, id), eq(projects.workspaceId, ctx.workspace.id)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(textOutputs)
    .set({ editedContentJson: parsed.data.content })
    .where(eq(textOutputs.id, id));

  return NextResponse.json({ ok: true });
}
