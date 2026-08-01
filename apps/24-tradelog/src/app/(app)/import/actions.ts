"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, executions, importBatches } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getAccount, listAccounts, rebuildTrades } from "@/lib/trades";
import { importText, MAX_IMPORT_BYTES, type ImportOutcome } from "@/lib/imports";
import { parserById } from "@/lib/parsers/registry";
import { accountLimitReached, plan } from "@/lib/plans";
import { encryptSecret } from "@/lib/secrets";
import { syncAccount } from "@/lib/sync";
import { has } from "@/lib/env";
import { recomputeFindings } from "@/lib/findings";

export interface AccountFormState {
  error?: string;
  created?: string;
}

export async function createAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireUser();
  const existing = await listAccounts(user.id);
  if (accountLimitReached(user.plan, existing.length)) {
    const limits = plan(user.plan);
    return {
      error:
        limits.accounts === 1
          ? `${limits.name} covers one account. Pro handles up to ${plan("pro").accounts} at $49/mo.`
          : `${limits.name} covers ${limits.accounts} accounts.`,
    };
  }

  const label = String(formData.get("label") ?? "").trim().slice(0, 60);
  if (label.length < 2) return { error: "Give the account a name you will recognise." };
  const broker = String(formData.get("broker") ?? "");
  if (broker !== "manual" && !parserById(broker)) return { error: "Pick a broker." };

  const [row] = await getDb()
    .insert(accounts)
    .values({
      userId: user.id,
      broker,
      label,
      currency: String(formData.get("currency") ?? "USD").slice(0, 8) || "USD",
    })
    .returning({ id: accounts.id });

  revalidatePath("/import");
  return { created: row.id };
}

export interface ImportFormState {
  outcome?: ImportOutcome;
  error?: string;
}

export async function importFileAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const user = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");
  const account = await getAccount(user.id, accountId);
  if (!account) return { error: "Choose an account to import into." };

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "");

  let text: string;
  let filename: string;
  let source: "upload" | "paste";

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMPORT_BYTES) {
      return { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the cap is 5 MB.` };
    }
    text = await file.text();
    filename = file.name;
    source = "upload";
  } else if (pasted.trim().length > 0) {
    text = pasted;
    filename = "Pasted rows";
    source = "paste";
  } else {
    return { error: "Choose a file, or paste the rows." };
  }

  const outcome = await importText({ user, account, text, filename, source });

  revalidatePath("/import");
  revalidatePath("/dashboard");
  revalidatePath("/journal");
  revalidatePath("/insights");
  return { outcome };
}

export interface SyncFormState {
  error?: string;
  message?: string;
}

export async function saveSyncCredentialsAction(
  _prev: SyncFormState,
  formData: FormData,
): Promise<SyncFormState> {
  const user = await requireUser();
  if (!has("SYNC_CREDS_ENCRYPTION_KEY")) {
    return {
      error:
        "Automatic sync is not configured on this deployment (SYNC_CREDS_ENCRYPTION_KEY is unset). CSV import works either way.",
    };
  }
  const accountId = String(formData.get("accountId") ?? "");
  const account = await getAccount(user.id, accountId);
  if (!account) return { error: "That account is not yours." };

  const token = String(formData.get("token") ?? "").trim();
  const queryId = String(formData.get("queryId") ?? "").trim();
  if (!token || !queryId) return { error: "Both the Flex token and the query id are needed." };
  if (!/^\d{6,}$/.test(token)) return { error: "A Flex token is a long run of digits." };
  if (!/^\d{3,}$/.test(queryId)) return { error: "A Flex query id is a run of digits." };

  await getDb()
    .update(accounts)
    .set({
      syncSecretEncrypted: encryptSecret(token),
      syncQueryId: queryId,
      lastSyncError: null,
    })
    .where(eq(accounts.id, account.id));

  revalidatePath("/import");
  return { message: "Saved. The next sync will use it." };
}

export async function syncNowAction(
  _prev: SyncFormState,
  formData: FormData,
): Promise<SyncFormState> {
  const user = await requireUser();
  const account = await getAccount(user.id, String(formData.get("accountId") ?? ""));
  if (!account) return { error: "That account is not yours." };

  const result = await syncAccount(user, account);
  revalidatePath("/import");
  revalidatePath("/dashboard");
  return result.ok
    ? { message: `Synced. ${result.imported} new fills.` }
    : { error: result.error ?? "Sync failed." };
}

/**
 * Delete one import batch and the fills it brought in, then rebuild.
 *
 * The rebuild is what makes this safe: removing a batch's executions changes
 * which lots close which trades, so the account's trades are re-derived from
 * what is left rather than patched.
 */
export async function deleteBatchAction(batchId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, user.id)));
  if (!batch) return;

  const account = await getAccount(user.id, batch.accountId);
  if (!account) return;

  await db.delete(executions).where(eq(executions.importBatchId, batch.id));
  await db.delete(importBatches).where(eq(importBatches.id, batch.id));
  await rebuildTrades(account);
  await recomputeFindings(user);

  revalidatePath("/import");
  revalidatePath("/dashboard");
  revalidatePath("/journal");
  revalidatePath("/insights");
}
