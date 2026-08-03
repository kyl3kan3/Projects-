"use server";

/**
 * Cert actions: add a cert (camera first), and delete one.
 *
 * Renewals append a new row rather than editing the old one. An expired-then-
 * renewed gap is honest history, and a GC asking "was he current in March?"
 * deserves the real answer.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { certs, employees } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { newObjectKey, putObject } from "@/lib/storage";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  employeeId: z.string().uuid("Pick an employee"),
  kind: z.enum(["osha_10", "osha_30", "first_aid_cpr", "fit_test", "license", "custom"]),
  label: z.string().min(2, "Name the card — what does it say on it?"),
  issuedOn: z.string().optional().default(""),
  expiresOn: z.string().optional().default(""),
});

export async function addCertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const parsed = schema.safeParse({
      employeeId: form.get("employeeId"),
      kind: form.get("kind"),
      label: form.get("label"),
      issuedOn: form.get("issuedOn"),
      expiresOn: form.get("expiresOn"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form", message: null };
    }
    const db = getDb();
    const [employee] = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.id, parsed.data.employeeId), eq(employees.companyId, company.id)));
    if (!employee) return { error: "That employee is not on this roster", message: null };

    // The photo of the card is the point: a cert nobody can produce is a cert
    // the GC does not accept.
    let cardPhotoKey: string | null = null;
    const photo = form.get("cardPhoto");
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > 6_000_000) {
        return { error: "That photo is over 6MB — take it again at a lower resolution", message: null };
      }
      const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      cardPhotoKey = newObjectKey(company.id, "certs", ext);
      await putObject(
        cardPhotoKey,
        new Uint8Array(await photo.arrayBuffer()),
        photo.type || "image/jpeg",
        company.id,
      );
    }

    await db.insert(certs).values({
      companyId: company.id,
      employeeId: employee.id,
      kind: parsed.data.kind,
      label: parsed.data.label.trim(),
      issuedOn: parsed.data.issuedOn || null,
      expiresOn: parsed.data.expiresOn || null,
      cardPhotoKey,
    });

    revalidatePath("/certs");
    return {
      error: null,
      message: `Added for ${employee.name}.${
        parsed.data.expiresOn
          ? " Reminders go out 60, 30 and 7 days before it expires, and once when it lapses."
          : " No expiry date, so no reminders — add one if the GC asks for currency."
      }`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that cert", message: null };
  }
}

export async function deleteCertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const id = String(form.get("certId") ?? "");
    const db = getDb();
    const deleted = await db
      .delete(certs)
      .where(and(eq(certs.id, id), eq(certs.companyId, company.id)))
      .returning({ id: certs.id });
    if (deleted.length === 0) return { error: "That cert is not on this company's records", message: null };
    revalidatePath("/certs");
    return { error: null, message: "Deleted. If it was a renewal, add the new card." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete that cert", message: null };
  }
}
