"use client";

import { ActionForm } from "@/components/ActionForm";
import { openPortalAction, startCheckoutAction } from "@/app/(console)/settings/billing/actions";
import type { FormState } from "@/lib/form";

export function ChoosePlanForm({ plan, label }: { plan: string; label: string }) {
  return (
    <ActionForm action={startCheckoutAction} submitLabel={label} variant="primary">
      <input type="hidden" name="plan" value={plan} />
    </ActionForm>
  );
}

export function PortalForm() {
  const action = async (_prev: FormState): Promise<FormState> => openPortalAction();
  return <ActionForm action={action} submitLabel="Manage billing" variant="secondary" full={false} />;
}
