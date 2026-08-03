import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { checklistTemplates } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { canEditTemplates } from "@/lib/plans";
import { CONTRACT_TYPE_LABELS, parseTemplateTasks } from "@/lib/templates";
import { TemplateEditor } from "./TemplateEditor";

export const metadata: Metadata = { title: "Edit a checklist" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireSession();
  if (!canEditTemplates(account).allowed) redirect("/templates");

  const [template] = await getDb()
    .select()
    .from(checklistTemplates)
    .where(and(eq(checklistTemplates.id, id), eq(checklistTemplates.accountId, account.id)));
  if (!template) notFound();

  const tasks = parseTemplateTasks(template.tasks);

  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-6 lg:pb-10">
      <p className="t-label">
        <Link href="/templates" className="btn-quiet">
          Checklists
        </Link>
      </p>
      <h1 className="t-display mt-2">{template.name}</h1>
      <p className="t-body mt-2 text-dim">
        {CONTRACT_TYPE_LABELS[template.contractType]}. Editing a rule here changes what future
        files compute — files already open keep the dates they were computed with, and a recompute
        on those files is an anchor edit with its own diff preview.
      </p>

      <div className="mt-8">
        <TemplateEditor templateId={template.id} name={template.name} tasks={tasks} />
      </div>
    </main>
  );
}
