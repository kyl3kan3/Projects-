import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireFirm } from "@/lib/auth";
import { activeSequence } from "@/lib/sequences";
import { LEVEL_LABEL, normalizeLadder, offsetLabel } from "@/lib/ladder";
import { renderStep, stepCopy } from "@/lib/tone";
import { lateFeeSentence } from "@/lib/settings";
import type { EscalationLevel } from "@/db/schema";
import { LadderEditor, StepCopyEditor, TonePicker } from "./SequenceForms";

export const metadata: Metadata = { title: "Sequences" };
export const dynamic = "force-dynamic";

/** A representative invoice, so previews read like real mail rather than tokens. */
const PREVIEW = {
  contactFirstName: "Dana",
  clientName: "Meridian Co",
  invoiceNumber: "INV-2041",
  amount: "$12,400.00",
  dueDate: "19 Jun 2026",
  portalUrl: "https://paidwell.app/portal/9f3c…",
};

export default async function SequencesPage() {
  const { firm } = await requireFirm();
  const sequence = await activeSequence(firm.id);
  const ladder = normalizeLadder(sequence.steps);
  const lateFee = lateFeeSentence(firm);

  return (
    <main>
      <ScreenHeader
        firmName={firm.name}
        meta={`${firm.sendMode === "approval" ? "approval mode" : "autopilot"} · ${ladder.length} steps · ${sequence.tone} voice`}
        metaHref="/settings"
      />

      <section className="gutter">
        <h1 className="t-h2">The escalation ladder</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          Four steps, each pinned to a fixed distance from the due date. A step that has
          passed is behind you for good — the ladder only ever moves forward, and it stops
          the moment an invoice is paid.
        </p>
      </section>

      <section className="gutter" style={{ marginTop: 32 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          Timing
        </p>
        <LadderEditor offsets={ladder.map((step) => step.offsetDaysFromDue)} />
      </section>

      <section className="gutter" style={{ marginTop: 40 }}>
        <p className="t-label" style={{ marginBottom: 4 }}>
          Your voice
        </p>
        <TonePicker current={sequence.tone} />
      </section>

      <section className="gutter" style={{ marginTop: 40, marginBottom: 40 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          The four steps, as they will read
        </p>
        <div style={{ display: "grid", gap: 16 }}>
          {ladder.map((step, index) => {
            const level = step.escalationLevel as EscalationLevel;
            const preset = stepCopy(sequence.tone, level);
            const rendered = renderStep({
              tone: sequence.tone,
              level,
              overrideSubject: step.subject,
              overrideBody: step.body,
              lateFeeSentence: lateFee,
              ctx: {
                ...PREVIEW,
                firmName: firm.name,
                daysOverdue: Math.max(0, step.offsetDaysFromDue),
                daysUntilDue: Math.max(0, -step.offsetDaysFromDue),
                signature: firm.settings?.signature || firm.name,
              },
            });
            const isOverridden = Boolean(step.subject || step.body);

            return (
              <article key={index} className="panel" style={{ padding: 16 }}>
                <p className="t-label">
                  Step {index + 1} · {offsetLabel(step.offsetDaysFromDue)} · {LEVEL_LABEL[level]}
                  {isOverridden ? " · your words" : ""}
                </p>
                <p className="t-title" style={{ marginTop: 8 }}>
                  {rendered.subject}
                </p>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {rendered.text
                    .split(/\n{2,}/)
                    .slice(0, 3)
                    .map((paragraph, i) => (
                      <p key={i} className="t-secondary" style={{ whiteSpace: "pre-wrap" }}>
                        {paragraph}
                      </p>
                    ))}
                </div>
                <p className="t-data" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
                  {step.offsetDaysFromDue < 0
                    ? `sends ${Math.abs(step.offsetDaysFromDue)} days before the due date`
                    : `sends on day ${step.offsetDaysFromDue} after the due date`}
                  {index === ladder.length - 1 ? " · then a person takes over" : ""}
                </p>
                <div style={{ marginTop: 8 }}>
                  <StepCopyEditor
                    stepIndex={index}
                    subject={step.subject ?? preset.subject}
                    body={step.body ?? preset.body.join("\n\n")}
                    isOverridden={isOverridden}
                  />
                </div>
              </article>
            );
          })}
        </div>

        <p className="t-secondary" style={{ marginTop: 24 }}>
          {lateFee
            ? "Your late-fee sentence is switched on and appears from step 3 onwards only — never on an early nudge."
            : "No late-fee sentence. You can switch one on in settings; it stays off until you do, and never appears before step 3."}{" "}
          <Link href="/settings" style={{ color: "var(--color-banker)", fontWeight: 600 }}>
            Settings
          </Link>
        </p>
      </section>
    </main>
  );
}
