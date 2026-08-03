import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listProperties } from "@/lib/vendors";
import { listTemplates } from "@/lib/requirements";
import { TRADES } from "@/lib/requirement-presets";
import { NewVendorForm } from "./NewVendorForm";

export const metadata: Metadata = { title: "Add vendor" };

export default async function NewVendorPage() {
  const { org } = await requireUser();
  const [properties, templates] = await Promise.all([
    listProperties(org.id),
    listTemplates(org.id),
  ]);

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <h1 className="t-h2">Add a vendor</h1>
      <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
        The vendor never gets an account. Once they are on the list, CertShield issues a link they
        (or their agent) can drop the certificate into.
      </p>
      <NewVendorForm
        properties={properties.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        defaultTemplateId={org.settings?.defaultTemplateId ?? null}
        trades={TRADES}
      />
    </main>
  );
}
