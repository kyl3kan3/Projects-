"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountingConnections, type AccountingProvider } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import {
  bookFromImportRows,
  connectionsFor,
  providerFor,
  syncConnection,
  upsertBook,
  upsertConnection,
} from "@/lib/accounting";
import { parseCsv, planImport } from "@/lib/csv";
import { firmSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import type { ImportProblem } from "@/lib/csv";

export interface ConnectState {
  error?: string;
  notice?: string;
  problems?: ImportProblem[];
}

/**
 * Connect a provider.
 *
 * With real credentials this hands off to the provider's OAuth screen. Without
 * them it creates a connection backed by the deterministic demo book and says so
 * — the firm is never shown demo numbers labelled as their own.
 */
export async function connectProviderAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { firm } = await requireFirm();
  const provider = String(formData.get("provider") ?? "") as AccountingProvider;
  if (provider !== "qbo" && provider !== "xero") {
    return { error: "Pick QuickBooks Online or Xero." };
  }

  const api = providerFor(provider);
  if (api.live) {
    // The OAuth handshake is the provider's own screen; the callback route
    // finishes the connection. Not exercisable without credentials.
    return {
      error: `${api.label} credentials are configured, so this would redirect to their consent screen. Set up the callback URL in your provider app first.`,
    };
  }

  const connection = await upsertConnection({
    firmId: firm.id,
    provider,
    realmId: "demo",
    displayName: `${api.label}`,
    accessToken: "demo",
  });
  const summary = await syncConnection(firm, connection);
  revalidatePath("/connect");
  revalidatePath("/aging");
  if (summary.error) return { error: summary.error };
  return {
    notice: `Connected with demo data: ${summary.clientsUpserted} clients, ${summary.invoicesUpserted} invoices, ${summary.settled} already settled.`,
  };
}

export async function resyncAction(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const { firm } = await requireFirm();
  const id = String(formData.get("connectionId") ?? "");
  const connections = await connectionsFor(firm.id);
  const connection = connections.find((c) => c.id === id);
  if (!connection) return { error: "That connection no longer exists." };
  const summary = await syncConnection(firm, connection);
  revalidatePath("/connect");
  revalidatePath("/aging");
  if (summary.error) return { error: summary.error };
  return {
    notice: `Synced ${summary.invoicesUpserted} invoices${
      summary.skippedForPlan > 0 ? `, skipped ${summary.skippedForPlan} over your plan limit` : ""
    }.`,
  };
}

export async function disconnectAction(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const { firm, user } = await requireFirm();
  const id = String(formData.get("connectionId") ?? "");
  const db = getDb();
  await db.delete(accountingConnections).where(eq(accountingConnections.id, id));
  await audit(firm.id, user.id, "settings_updated", "accounting disconnected");
  revalidatePath("/connect");
  return { notice: "Disconnected. Your invoices stay, but nothing new will sync." };
}

/** Import a CSV. Nothing is written until the rows parse cleanly. */
export async function importCsvAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { firm } = await requireFirm();
  const raw = String(formData.get("csv") ?? "").trim();
  if (!raw) return { error: "Paste some CSV, or use the sample to see the format." };

  const plan = planImport(parseCsv(raw), firmSettings(firm).defaultTermsDays);
  if (plan.rows.length === 0) {
    return { error: "Nothing could be imported from that file.", problems: plan.problems };
  }

  await upsertConnection({
    firmId: firm.id,
    provider: "csv",
    realmId: "upload",
    displayName: "CSV import",
  });
  const summary = await upsertBook({
    firm,
    provider: "csv",
    book: bookFromImportRows(plan.rows),
  });

  const db = getDb();
  await db
    .update(accountingConnections)
    .set({ syncStatus: "ok", lastSyncedAt: new Date() })
    .where(eq(accountingConnections.firmId, firm.id));

  revalidatePath("/connect");
  revalidatePath("/aging");
  return {
    notice: `Imported ${summary.invoicesUpserted} invoices across ${summary.clientsUpserted} clients${
      summary.skippedForPlan > 0 ? `. ${summary.skippedForPlan} were skipped: your plan is full` : ""
    }.`,
    problems: plan.problems,
  };
}
