"use client";

import { useMemo, useState, useTransition } from "react";
import type { SequenceStep } from "@/lib/sample-data";
import { Icon } from "./icons";

const mergeTags = ["{{customer_name}}", "{{amount_due}}", "{{card_update_url}}"];

export function SequenceEditor({ steps }: { steps: SequenceStep[] }) {
  const [drafts, setDrafts] = useState(() => steps);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeChannels = useMemo(() => new Set(drafts.map((step) => step.channel)), [drafts]);

  function updateStep(id: string, field: "subject" | "body", value: string) {
    setDrafts((current) => current.map((step) => (step.id === id ? { ...step, [field]: value } : step)));
  }

  function insertMergeTag(id: string, tag: string) {
    setDrafts((current) =>
      current.map((step) => (step.id === id ? { ...step, body: `${step.body} ${tag}`.trim() } : step)),
    );
  }

  function addStep() {
    setDrafts((current) => [
      ...current,
      {
        id: `step_${current.length + 1}_${Date.now()}`,
        kind: "EMAIL",
        day: "day 10",
        subject: "One more card update reminder",
        body: "A final plain-language reminder with {{card_update_url}}.",
        stats: "New template",
        channel: "email",
      },
    ]);
  }

  function saveTemplates() {
    startTransition(() => {
      setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    });
  }

  return (
    <div className="space-y-3">
      <div className="panel p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="t-label">Template editor</p>
            <p className="t-secondary mt-2">
              {drafts.length} steps - {activeChannels.has("sms") ? "email and SMS" : "email only"}
            </p>
          </div>
          <button className="btn btn-secondary" disabled={isPending} onClick={saveTemplates} type="button">
            <Icon name="check" className="h-[18px] w-[18px]" />
            {savedAt ? `Saved ${savedAt}` : "Save templates"}
          </button>
        </div>
      </div>

      {drafts.map((step, index) => (
        <article key={step.id} className="panel p-4">
          <div className="flex items-start gap-3">
            <div className="grid min-h-11 min-w-11 place-items-center rounded-[8px] border border-[var(--color-hairline)] text-[var(--color-text-2)]">
              <Icon name={step.channel === "email" ? "mail" : "message-sms"} className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="t-label">
                {step.kind} - {step.day}
              </p>
              <label className="mt-3 block">
                <span className="t-label">Subject</span>
                <input
                  className="input mt-2"
                  onChange={(event) => updateStep(step.id, "subject", event.target.value)}
                  value={step.subject}
                />
              </label>
              <label className="mt-3 block">
                <span className="t-label">Body</span>
                <textarea
                  className="textarea mt-2"
                  onChange={(event) => updateStep(step.id, "body", event.target.value)}
                  rows={3}
                  value={step.body}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {mergeTags.map((tag) => (
                  <button className="chip" key={tag} onClick={() => insertMergeTag(step.id, tag)} type="button">
                    {tag}
                  </button>
                ))}
              </div>
              <p className="data mt-3 text-xs text-[var(--color-text-3)]">{step.stats}</p>
            </div>
            <span className="data text-xs text-[var(--color-text-3)]">{String(index + 1).padStart(2, "0")}</span>
          </div>
        </article>
      ))}
      <button className="btn btn-secondary w-full" onClick={addStep} type="button">
        <Icon name="plus" className="h-[18px] w-[18px]" />
        Add sequence step
      </button>
    </div>
  );
}
