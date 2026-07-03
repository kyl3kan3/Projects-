import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ProjectView } from "@/components/ProjectView";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspace } = await requireUser();
  const { id } = await params;

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, workspace.id)));
  if (!project) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ProjectView projectId={id} />
    </main>
  );
}
