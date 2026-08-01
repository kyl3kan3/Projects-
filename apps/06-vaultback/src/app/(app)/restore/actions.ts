"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSnapshot } from "@/lib/backups";
import { ConnectionStringError } from "@/lib/providers";
import { RestoreRefused, runRestore, startRestore } from "@/lib/restore";

export interface RestoreFormState {
  error?: string;
  ok?: boolean;
  summary?: string;
}

/**
 * Run the restore inline and await it.
 *
 * A restore is the one operation nobody wants to walk away from: the person
 * pressing the key-turn is watching, usually on their worst day of the quarter,
 * and "queued" is not an answer. The trade-off is the host's function duration —
 * a restore larger than that needs the worker process (see DEPLOYING.md).
 */
export async function restoreAction(
  _prev: RestoreFormState,
  form: FormData,
): Promise<RestoreFormState> {
  const { user, org } = await requireUser();

  const snapshotId = String(form.get("snapshotId") ?? "");
  const target = String(form.get("target") ?? "").trim();
  const allowNonEmpty = form.get("allowNonEmpty") === "on";

  const snapshot = await getSnapshot(snapshotId, org.id);
  if (!snapshot) return { error: "That snapshot is not in your organization" };
  if (snapshot.deletedAt) return { error: "That snapshot has passed its retention window" };

  try {
    const run = await startRestore({
      orgId: org.id,
      actorUserId: user.id,
      snapshot,
      targetConnectionString: target,
      allowNonEmpty,
    });
    const result = await runRestore(run.id);
    revalidatePath("/restore");
    revalidatePath("/settings/activity");

    if (!result.ok) return { error: result.error ?? "The restore did not complete" };
    return {
      ok: true,
      summary: `${result.tablesRestored} tables and ${result.rowsRestored.toLocaleString("en-US")} rows restored into ${run.targetFingerprint}.`,
    };
  } catch (err) {
    if (err instanceof RestoreRefused || err instanceof ConnectionStringError) {
      return { error: err.message };
    }
    console.error("[restore] failed", err);
    return { error: "The restore could not be started" };
  }
}
