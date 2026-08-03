"use client";

import { ActionForm } from "@/components/ActionForm";
import type { HostedAction } from "./data";
import { simulateAction } from "./actions";

export function SimulateForm({
  kind,
  ref_,
  actions,
}: {
  kind: string;
  ref_: string;
  actions: HostedAction[];
}) {
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {actions.map((action) => (
        <ActionForm
          key={action.value}
          action={simulateAction}
          submitLabel={action.label}
          variant={action.variant}
          full
          hiddenFields={{ kind, ref: ref_, outcome: action.value }}
        />
      ))}
    </div>
  );
}
