import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { planFor } from "@/lib/plans";
import { ProjectView } from "@/components/ProjectView";
import { BottomNav } from "@/components/BottomNav";
import { UploadSheet } from "@/components/UploadSheet";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, workspace } = await requireUser();
  const { id } = await params;

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, workspace.id)));
  if (!project) notFound();

  const plan = planFor(workspace.plan);
  const overLimit = workspace.uploadsUsedThisPeriod >= plan.uploadsPerPeriod;

  return (
    <main className="mx-auto max-w-2xl px-5 pt-2">
      <ProjectView projectId={id} />
      <UploadSheet overLimit={overLimit} />
      <BottomNav email={user.email} />
    </main>
  );
}
