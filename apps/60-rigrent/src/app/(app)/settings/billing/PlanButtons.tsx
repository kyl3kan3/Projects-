"use client";

import { ActionForm } from "@/components/ActionForm";
import type { Plan } from "@/db/schema";
import type { FormState } from "@/lib/form";

export function PlanButton({
  plan,
  label,
  action,
  current,
  disabled,
  disabledReason,
}: {
  plan: Plan;
  label: string;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  current: boolean;
  disabled: boolean;
  disabledReason?: string;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={current ? "Current plan" : label}
      variant={current ? "secondary" : "primary"}
      disabled={disabled || current}
      disabledReason={current ? undefined : disabledReason}
    >
      <input type="hidden" name="plan" value={plan} />
    </ActionForm>
  );
}
