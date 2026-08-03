import type { Metadata } from "next";
import { requirePractice } from "@/lib/auth";
import { consentScript, listClients } from "@/lib/clients";
import { listTemplates } from "@/lib/templates";
import { billingFacts } from "@/lib/billing";
import { canCapture, canUseModality, entitlement, meter } from "@/lib/plans";
import { currentPeriodUsage } from "@/lib/usage";
import { CaptureForms } from "./CaptureForms";

export const metadata: Metadata = { title: "Capture" };
export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const { practice, user } = await requirePractice();
  const now = new Date();
  const [clients, templates, usage] = await Promise.all([
    listClients(practice.id),
    listTemplates(practice.id),
    currentPeriodUsage(practice.id, practice.timezone, now),
  ]);

  const ent = entitlement(billingFacts(practice), now);
  const gate = canCapture(ent, usage.notesDrafted);
  const m = meter(usage.notesDrafted, ent.noteLimit);

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">Capture a session</h1>
      <p className="t-secondary mb-5">
        {m.limit === null
          ? m.label
          : `${m.label}${m.nearLimit && !m.exceeded ? " — nearly at your plan's limit" : ""}`}
      </p>

      <CaptureForms
        clients={clients.map((c) => ({
          id: c.id,
          displayLabel: c.displayLabel,
          modality: c.modality,
          consent: c.recordingConsent,
          defaultTemplateId: c.defaultTemplateId,
        }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          format: t.format,
          modality: t.modality,
          allowed: canUseModality(ent, t.modality),
        }))}
        retentionDays={practice.retentionDays}
        consentScript={consentScript(practice.retentionDays)}
        captureBlocked={gate.allowed ? null : (gate.message ?? null)}
      />

      <p className="t-secondary mt-8">
        Signed in as {user.name}
        {user.credentials ? `, ${user.credentials}` : ""} · default format{" "}
        {user.defaultFormat.toUpperCase()}
      </p>
    </main>
  );
}
