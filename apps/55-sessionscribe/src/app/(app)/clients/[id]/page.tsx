import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePractice } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { listTemplates } from "@/lib/templates";
import { sessionsForClient } from "@/lib/sessions";
import { billingFacts } from "@/lib/billing";
import { canUseModality, entitlement } from "@/lib/plans";
import { CONSENT_LABEL, MODALITY_LABEL, formatDate } from "@/lib/format";
import { ClientForm } from "../ClientForm";
import { SessionRow } from "@/components/SessionRow";

export const metadata: Metadata = { title: "Client" };
export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { practice } = await requirePractice();
  const client = await getClient(practice.id, id);
  if (!client) notFound();

  const [templates, sessions] = await Promise.all([
    listTemplates(practice.id),
    sessionsForClient(practice.id, id),
  ]);
  const ent = entitlement(billingFacts(practice), new Date());
  const now = new Date();

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">{client.displayLabel}</h1>
      <p className="t-secondary">
        {MODALITY_LABEL[client.modality]} · {CONSENT_LABEL[client.recordingConsent]}
        {client.consentNotedAt
          ? ` since ${formatDate(client.consentNotedAt, practice.timezone)}`
          : ""}
      </p>
      <p className="t-secondary t-faint mb-6">
        Audio and transcripts for this client purge after {practice.retentionDays} days.
      </p>

      <h2 className="t-label mb-2">Session history</h2>
      {sessions.length === 0 ? (
        <p className="t-secondary mb-8 py-2">No sessions captured for this client yet.</p>
      ) : (
        <div className="mb-8">
          {sessions.map((row) => (
            <SessionRow
              key={row.session.id}
              row={row}
              timeZone={practice.timezone}
              now={now}
            />
          ))}
        </div>
      )}

      <h2 className="t-label mb-3">Edit</h2>
      <ClientForm
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          allowed: canUseModality(ent, t.modality),
        }))}
        client={{
          id: client.id,
          displayLabel: client.displayLabel,
          modality: client.modality,
          defaultTemplateId: client.defaultTemplateId,
          recordingConsent: client.recordingConsent,
          status: client.status,
        }}
      />
    </main>
  );
}
