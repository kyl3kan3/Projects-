"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { households, members } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import type { Actor } from "@/lib/audit";
import { today } from "@/lib/dates";
import {
  addMember,
  createHousehold,
  importRoster,
  issuePortalLink,
  previewImport,
  transferOwnership,
} from "@/lib/roster";
import { revokePortalToken } from "@/lib/portal";
import { audit } from "@/lib/audit";
import { unitUsage } from "@/lib/plans";
import { activeHouseholdCount } from "@/lib/roster";

export interface RosterState {
  error?: string;
  ok?: string;
  /** Set by the dry-run preview so the screen can show what will happen. */
  preview?: {
    rows: { unitLabel: string; people: string[]; joinedOn: string; existing: boolean }[];
    problems: { line: number; reason: string }[];
    csv: string;
  };
}

function actorFor(user: { id: string; name: string }): Actor {
  return { kind: "user", id: user.id, name: user.name };
}

async function ownedHousehold(associationId: string, householdId: string) {
  const [row] = await getDb()
    .select()
    .from(households)
    .where(and(eq(households.id, householdId), eq(households.associationId, associationId)));
  if (!row) throw new Error("That household is not on this association's roster");
  return row;
}

/** Step one of the import: parse and show, change nothing. */
export async function previewImportAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  try {
    const { association } = await requireCapability("roster");
    const file = formData.get("file");
    const pasted = String(formData.get("csv") ?? "");
    const text = file instanceof File && file.size > 0 ? await file.text() : pasted;
    if (!text.trim()) return { error: "Choose a CSV file, or paste the rows into the box" };

    const preview = await previewImport(association.id, text);
    const existing = new Set(preview.existingUnits.map((u) => u.toLowerCase()));
    return {
      preview: {
        rows: preview.rows.map((r) => ({
          unitLabel: r.unitLabel,
          people: r.people.map((p) => `${p.name}${p.email ? ` <${p.email}>` : " (no email)"}`),
          joinedOn: r.joinedOn,
          existing: existing.has(r.unitLabel.toLowerCase()),
        })),
        problems: preview.problems.map((p) => ({ line: p.line, reason: p.reason })),
        csv: text,
      },
      ok:
        preview.rows.length === 0
          ? "Nothing importable was found. Check the column headings."
          : `Read ${preview.rows.length} household${preview.rows.length === 1 ? "" : "s"}${
              preview.problems.length ? `, with ${preview.problems.length} row(s) to look at` : ""
            }. Nothing has been saved yet.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read that file" };
  }
}

/** Step two: commit exactly what the preview showed. */
export async function commitImportAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  try {
    const { association, user } = await requireCapability("roster");
    const text = String(formData.get("csv") ?? "");
    if (!text.trim()) return { error: "The import expired — upload the file again" };
    const result = await importRoster(association.id, text, actorFor(user));
    revalidatePath("/roster");
    revalidatePath("/dues");

    const usage = unitUsage(association.plan, await activeHouseholdCount(association.id));
    const overflow =
      usage.over > 0
        ? ` You are now billing ${usage.used} units on a plan that includes ${usage.included} — nothing is blocked, but the plan should catch up.`
        : "";

    return {
      ok:
        `Imported ${result.createdHouseholds} new household${result.createdHouseholds === 1 ? "" : "s"} ` +
        `and ${result.createdMembers} contact${result.createdMembers === 1 ? "" : "s"}` +
        (result.updatedHouseholds ? `, updating ${result.updatedHouseholds} that already existed` : "") +
        `.${overflow}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not import the roster" };
  }
}

export async function addHouseholdAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  try {
    const { association, user } = await requireCapability("roster");
    await createHousehold(
      association.id,
      {
        unitLabel: String(formData.get("unitLabel") ?? ""),
        mailingAddress: String(formData.get("mailingAddress") ?? "") || null,
        joinedOn: String(formData.get("joinedOn") ?? today()),
        primaryName: String(formData.get("primaryName") ?? ""),
        primaryEmail: String(formData.get("primaryEmail") ?? "") || null,
        primaryPhone: String(formData.get("primaryPhone") ?? "") || null,
      },
      actorFor(user),
    );
    revalidatePath("/roster");
    revalidatePath("/dues");
    return { ok: "Household added." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that household" };
  }
}

export async function addMemberAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  try {
    const { association, user } = await requireCapability("roster");
    const householdId = String(formData.get("householdId") ?? "");
    await ownedHousehold(association.id, householdId);
    await addMember(
      householdId,
      {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? "") || null,
        phone: String(formData.get("phone") ?? "") || null,
      },
      actorFor(user),
    );
    revalidatePath(`/roster/${householdId}`);
    return { ok: "Added to the household." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that person" };
  }
}

export async function issueLinkAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  try {
    const { association, user } = await requireCapability("roster");
    const memberId = String(formData.get("memberId") ?? "");
    const [row] = await getDb()
      .select({ householdId: members.householdId })
      .from(members)
      .innerJoin(households, eq(members.householdId, households.id))
      .where(and(eq(members.id, memberId), eq(households.associationId, association.id)));
    if (!row) return { error: "That member is not on this association's roster" };

    const link = await issuePortalLink(memberId, actorFor(user));
    revalidatePath(`/roster/${row.householdId}`);
    return {
      ok: `New link (the previous one stopped working): ${link}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not issue a link" };
  }
}

export async function revokeLinkAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  try {
    const { association, user } = await requireCapability("roster");
    const memberId = String(formData.get("memberId") ?? "");
    const [row] = await getDb()
      .select({ householdId: members.householdId, name: members.name })
      .from(members)
      .innerJoin(households, eq(members.householdId, households.id))
      .where(and(eq(members.id, memberId), eq(households.associationId, association.id)));
    if (!row) return { error: "That member is not on this association's roster" };

    await revokePortalToken(memberId);
    await audit(association.id, actorFor(user), "revoked_portal_link", row.name, { memberId });
    revalidatePath(`/roster/${row.householdId}`);
    return { ok: "Revoked. Any link already in their inbox now shows the expired screen." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not revoke that link" };
  }
}

export async function transferOwnershipAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  try {
    const { association, user } = await requireCapability("roster");
    const householdId = String(formData.get("householdId") ?? "");
    await ownedHousehold(association.id, householdId);
    const leftOn = String(formData.get("leftOn") ?? today());
    const incoming = await transferOwnership(
      householdId,
      {
        leftOn,
        joinedOn: String(formData.get("joinedOn") ?? leftOn),
        newPrimaryName: String(formData.get("newPrimaryName") ?? ""),
        newPrimaryEmail: String(formData.get("newPrimaryEmail") ?? "") || null,
        newPrimaryPhone: String(formData.get("newPrimaryPhone") ?? "") || null,
      },
      actorFor(user),
    );
    revalidatePath("/roster");
    revalidatePath("/dues");
    return {
      ok: `Done. The old household is closed with its balance intact, and unit ${incoming.unitLabel} now belongs to the new owner.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record that sale" };
  }
}
