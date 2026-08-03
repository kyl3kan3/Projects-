import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTemplates, summariseTemplate, templateUsage } from "@/lib/requirements";
import { IconChevron, IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Requirements" };

export default async function RequirementsPage() {
  const { org } = await requireUser();
  const [templates, usage] = await Promise.all([listTemplates(org.id), templateUsage(org.id)]);

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <div>
          <h1 className="t-h2">Requirement templates</h1>
          <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
            Your insurance addendum, written as lines the engine can check. Every deficiency sentence
            quotes the label and minimum you set here.
          </p>
        </div>
        <Link href="/requirements/new" className="btn btn-primary" style={{ flex: "none" }}>
          <IconPlus size={18} />
          New
        </Link>
      </div>

      <div style={{ marginTop: 20 }}>
        {templates.map((template) => (
          <Link
            key={template.id}
            href={`/requirements/${template.id}`}
            className="row no-underline"
            style={{ alignItems: "flex-start" }}
          >
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="t-title" style={{ display: "block" }}>
                {template.name}
              </span>
              <span className="t-secondary" style={{ display: "block" }}>
                {usage.get(template.id) ?? 0} engagement
                {(usage.get(template.id) ?? 0) === 1 ? "" : "s"} held to this
              </span>
              <span className="t-mono" style={{ display: "block", marginTop: 4, color: "var(--color-dim)" }}>
                {summariseTemplate(template)}
              </span>
            </span>
            <IconChevron size={18} />
          </Link>
        ))}
      </div>

      <p className="t-secondary" style={{ marginTop: 24, maxWidth: "62ch" }}>
        These are a starting point taken from the limits that appear in mid-market vendor addenda —
        not legal advice. Match them to your own contract before you rely on a verdict.
      </p>
    </main>
  );
}
