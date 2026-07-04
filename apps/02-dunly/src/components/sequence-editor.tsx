import type { SequenceStep } from "@/lib/sample-data";
import { Icon } from "./icons";

export function SequenceEditor({ steps }: { steps: SequenceStep[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <article key={step.id} className="panel p-4">
          <div className="flex items-start gap-3">
            <div className="grid min-h-11 min-w-11 place-items-center rounded-[8px] border border-[var(--color-hairline)] text-[var(--color-text-2)]">
              <Icon name={step.channel === "email" ? "mail" : "message-sms"} className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="t-label">
                {step.kind} - {step.day}
              </p>
              <h2 className="t-title mt-2">{step.subject}</h2>
              <p className="t-secondary mt-2">{step.body}</p>
              <p className="data mt-3 text-xs text-[var(--color-text-3)]">{step.stats}</p>
            </div>
            <span className="data text-xs text-[var(--color-text-3)]">{String(index + 1).padStart(2, "0")}</span>
          </div>
        </article>
      ))}
      <button className="btn btn-secondary w-full" type="button">
        <Icon name="plus" className="h-[18px] w-[18px]" />
        Add sequence step
      </button>
    </div>
  );
}
