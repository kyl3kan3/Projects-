import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listTemplates } from "@/lib/requirements";
import { VENDOR_CSV_TEMPLATE } from "@/lib/csv";
import { ImportForm } from "./ImportForm";

export const metadata: Metadata = { title: "Import vendors" };

export default async function ImportVendorsPage() {
  const { org } = await requireUser();
  const templates = await listTemplates(org.id);

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <h1 className="t-h2">Import vendors</h1>
      <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
        Paste or upload the list you already keep. Good rows import; bad rows are named by line
        number and left for you to fix — nothing is rejected wholesale over one missing email.
      </p>
      <ImportForm
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        defaultTemplateId={org.settings?.defaultTemplateId ?? null}
        templateCsv={VENDOR_CSV_TEMPLATE.trim()}
      />
    </main>
  );
}
