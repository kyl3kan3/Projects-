import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listTemplates, templateById, templateUsage } from "@/lib/requirements";
import { DEFAULT_TEMPLATES } from "@/lib/requirement-presets";
import { TemplateEditor } from "./TemplateEditor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id === "new") return { title: "New requirement template" };
  const { org } = await requireUser();
  const template = await templateById(org.id, id);
  return { title: template?.name ?? "Requirement template" };
}

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { org } = await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;

  if (id === "new") {
    const existing = await listTemplates(org.id);
    const preset = DEFAULT_TEMPLATES[0];
    return (
      <main style={{ padding: "24px var(--gutter) 0" }}>
        <Link href="/requirements" className="btn-quiet">
          All requirements
        </Link>
        <h1 className="t-display" style={{ marginTop: 12 }}>
          New requirement template
        </h1>
        <p className="t-secondary" style={{ marginTop: 6, maxWidth: "62ch" }}>
          Starting from the standard vendor lines. You have {existing.length} template
          {existing.length === 1 ? "" : "s"} already.
        </p>
        <TemplateEditor
          templateId="new"
          initialName=""
          initialNotes=""
          initialLines={preset.lines}
          initialFlags={preset.flags}
          usage={0}
        />
      </main>
    );
  }

  const template = await templateById(org.id, id);
  if (!template) notFound();
  const usage = (await templateUsage(org.id)).get(template.id) ?? 0;

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <Link href="/requirements" className="btn-quiet">
        All requirements
      </Link>
      <h1 className="t-display" style={{ marginTop: 12 }}>
        {template.name}
      </h1>
      {saved && (
        <p className="t-secondary" role="status" style={{ marginTop: 8 }}>
          Saved. Every engagement held to this template was re-evaluated.
        </p>
      )}
      <TemplateEditor
        templateId={template.id}
        initialName={template.name}
        initialNotes={template.notes ?? ""}
        initialLines={template.lines}
        initialFlags={template.flags}
        usage={usage}
      />
    </main>
  );
}
