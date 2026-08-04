"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createCustomer, updateCustomer } from "@/lib/customers";
import { checkbox, field, formError, formOk, snapshot, type FormState } from "@/lib/form";
import { canWrite, entitlements } from "@/lib/plans";

export async function createCustomerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  let customerId: string;
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);
    const customer = await createCustomer({
      accountId: account.id,
      name: field(form, "name"),
      email: field(form, "email") || null,
      phone: field(form, "phone") || null,
      company: field(form, "company") || null,
      taxExempt: checkbox(form, "taxExempt"),
      notes: field(form, "notes") || null,
      actor: user.email,
    });
    customerId = customer.id;
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the customer.", values);
  }
  revalidatePath("/customers");
  redirect(`/customers/${customerId}`);
}

export async function updateCustomerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const customerId = field(form, "customerId");
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);
    await updateCustomer({
      accountId: account.id,
      customerId,
      name: field(form, "name"),
      email: field(form, "email") || null,
      phone: field(form, "phone") || null,
      company: field(form, "company") || null,
      taxExempt: checkbox(form, "taxExempt"),
      notes: field(form, "notes") || null,
      actor: user.email,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not save the customer.", values);
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return formOk("Saved. Tax-exempt status applies to their next quote.", values);
}
