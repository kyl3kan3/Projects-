/**
 * Broker sync. One broker at MVP: IBKR's Flex Web Service (see lib/flex.ts).
 *
 * A sync is just an import with a different source, so it goes through exactly
 * the same path — same parser, same dedupe, same plan gate, same rebuild. The
 * only thing this module adds is fetching the bytes and recording what happened
 * on the account, so a sync that has quietly stopped working is visible on the
 * import screen instead of being invisible forever.
 */

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, users, type Account, type User } from "@/db/schema";
import { fetchFlexStatement, parseFlexStatement } from "@/lib/flex";
import { importText, type ImportOutcome } from "@/lib/imports";
import { decryptSecret } from "@/lib/secrets";

export interface SyncResult {
  accountId: string;
  label: string;
  ok: boolean;
  imported: number;
  error: string | null;
}

/** Accounts with sync configured, oldest sync first so none is starved. */
export async function accountsDueForSync(limit = 25): Promise<{ account: Account; user: User }[]> {
  const rows = await getDb()
    .select({ account: accounts, user: users })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(
      and(
        isNotNull(accounts.syncSecretEncrypted),
        isNotNull(accounts.syncQueryId),
        isNull(accounts.archivedAt),
      ),
    )
    .limit(limit);
  return rows.sort(
    (a, b) => (a.account.lastSyncedAt?.getTime() ?? 0) - (b.account.lastSyncedAt?.getTime() ?? 0),
  );
}

export async function syncAccount(
  user: User,
  account: Account,
  signal?: AbortSignal,
): Promise<SyncResult> {
  const db = getDb();
  const base = { accountId: account.id, label: account.label };

  if (!account.syncSecretEncrypted || !account.syncQueryId) {
    return { ...base, ok: false, imported: 0, error: "No sync credentials on this account." };
  }

  try {
    const token = decryptSecret(account.syncSecretEncrypted);
    const xml = await fetchFlexStatement(token, account.syncQueryId, signal);
    // Parse once here so a malformed statement is an error before any write.
    parseFlexStatement(xml, { timeZone: user.timezone });

    const outcome: ImportOutcome = await importText({
      user,
      account,
      text: xml,
      filename: `IBKR Flex ${new Date().toISOString().slice(0, 10)}.xml`,
      source: "sync",
      parserId: "ibkr-flex-xml",
    });

    await db
      .update(accounts)
      .set({ lastSyncedAt: new Date(), lastSyncError: outcome.refusal })
      .where(eq(accounts.id, account.id));

    return { ...base, ok: outcome.ok, imported: outcome.imported, error: outcome.refusal };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await db
      .update(accounts)
      .set({ lastSyncedAt: new Date(), lastSyncError: message })
      .where(eq(accounts.id, account.id));
    return { ...base, ok: false, imported: 0, error: message };
  }
}
