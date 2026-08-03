import type { Metadata } from "next";
import Link from "next/link";
import { requirePractice } from "@/lib/auth";
import { listClients } from "@/lib/clients";
import { listTemplates } from "@/lib/templates";
import { billingFacts } from "@/lib/billing";
import { canUseModality, entitlement } from "@/lib/plans";
import { CONSENT_LABEL, MODALITY_LABEL, formatDate } from "@/lib/format";
import { ClientForm } from "./ClientForm";
import { IconChevronRight } from "@/components/icons";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { practice } = await requirePractice();
  const [clients, templates] = await Promise.all([
    listClients(practice.id, { includeArchived: true }),
    listTemplates(practice.id),
  ]);
  const ent = entitlement(billingFacts(practice), new Date());

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">Clients</h1>
      <p className="t-secondary mb-5">
        Labels, modalities and consent — deliberately not a chart. Audio purges after{" "}
        {practice.retentionDays} days; the signed note is the durable record.
      </p>

      {clients.length > 0 && (
        <section className="mb-8">
          {clients.map((client) => (
            <Link key={client.id} className="row" href={`/clients/${client.id}`}>
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">
                  {client.displayLabel} — {MODALITY_LABEL[client.modality]}
                </span>
                <span className="t-secondary block">
                  {CONSENT_LABEL[client.recordingConsent]} ·{" "}
                  {client.sessionCount} session{client.sessionCount === 1 ? "" : "s"}
                  {client.lastSessionAt
                    ? ` · last ${formatDate(client.lastSessionAt, practice.timezone)}`
                    : ""}
                  {client.status === "archived" ? " · archived" : ""}
                </span>
              </span>
              <span style={{ color: "var(--color-ink-3)" }}>
                <IconChevronRight size={18} />
              </span>
            </Link>
          ))}
        </section>
      )}

      <h2 className="t-label mb-3">Add a client</h2>
      <ClientForm
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          allowed: canUseModality(ent, t.modality),
        }))}
      />
    </main>
  );
}
