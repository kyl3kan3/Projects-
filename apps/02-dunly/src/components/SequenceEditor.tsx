"use client";

/**
 * Sequence step cards (carbon, radius 14): Label kind ("EMAIL · DAY 3"),
 * subject in Title, mono send stats. Steps' day offsets are editable;
 * the campaign toggles active.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconMail, IconPause, IconPlay } from "@/components/icons";

interface Step {
  offsetHours: number;
  channel: "email" | "sms";
  templateKey: string;
}

const SUBJECTS: Record<string, string> = {
  dunning_1_heads_up: "Payment issue with your subscription",
  dunning_2_reminder: "Reminder: payment still pending",
  dunning_3_urgent: "Action needed to keep your account active",
  dunning_4_final: "Final notice: your subscription",
  predunning_1_expiring: "Your card on file expires soon",
  predunning_2_last_call: "Last call: card expiring before renewal",
};

export function SequenceEditor({
  campaign,
  stats,
}: {
  campaign: { id: string; name: string; type: string; steps: Step[]; active: boolean };
  stats: { sent: number; clicked: number };
}) {
  const router = useRouter();
  const [steps, setSteps] = useState(campaign.steps);
  const [active, setActive] = useState(campaign.active);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(next?: { active?: boolean; steps?: Step[] }) {
    setBusy(true);
    await fetch(`/api/sequences/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next ?? { steps }),
    });
    setBusy(false);
    setDirty(false);
    router.refresh();
  }

  function setDay(i: number, day: number) {
    const next = steps.map((s, j) => (j === i ? { ...s, offsetHours: Math.max(0, day) * 24 } : s));
    setSteps(next);
    setDirty(true);
  }

  const clickRate = stats.sent > 0 ? Math.round((stats.clicked / stats.sent) * 100) : null;

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="t-title">{campaign.name}</h2>
          <p className="t-secondary mt-0.5">
            {stats.sent > 0
              ? `${stats.sent} sent${clickRate !== null ? ` · ${clickRate}% clicked` : ""}`
              : "No sends yet"}
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => {
            setActive(!active);
            void save({ active: !active });
          }}
        >
          {active ? <IconPause size={16} /> : <IconPlay size={16} />}
          {active ? "Active" : "Paused"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="t-label flex items-center gap-2">
                <IconMail size={16} />
                {step.channel.toUpperCase()} ·{" "}
                {step.offsetHours === 0 ? "IMMEDIATELY" : `DAY ${Math.round(step.offsetHours / 24)}`}
              </span>
              <label className="flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
                day
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="input"
                  style={{ width: 64, minHeight: 36, padding: "6px 10px", fontSize: 14 }}
                  value={Math.round(step.offsetHours / 24)}
                  onChange={(e) => setDay(i, Number(e.target.value))}
                />
              </label>
            </div>
            <p className="t-title mt-2 text-[15px]">
              {SUBJECTS[step.templateKey] ?? step.templateKey}
            </p>
          </div>
        ))}
      </div>

      {dirty && (
        <button className="btn btn-primary btn-block mt-4 sm:w-auto" disabled={busy} onClick={() => save()}>
          {busy ? "Saving" : "Save sequence"}
        </button>
      )}
    </section>
  );
}
