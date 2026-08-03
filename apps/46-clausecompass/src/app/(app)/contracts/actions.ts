"use server";

/**
 * Contract server actions. Each one is a public endpoint, so each one re-resolves the
 * session and scopes its query by `accountId` — the id in the URL is never trusted.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  createReview,
  deleteContract,
  getContract,
  ParseError,
  setContractType,
  setRedlineAccepted,
} from "@/lib/contracts";
import { advanceContract, progressOf, type StageProgress } from "@/lib/pipeline";
import { NoCreditsError } from "@/lib/billing";
import { createShareLink, revokeShareLink, shareUrlFor } from "@/lib/reports";
import { fixtureByKey } from "@/fixtures/contracts";
import type { ContractType, SourceKind } from "@/db/schema";
import { MAX_BYTES } from "@/lib/parse";

export interface UploadState {
  error: string | null;
  needsCredits?: boolean;
  /** Set on success; the client navigates to the contract's own page. */
  contractId?: string;
}

/**
 * Start a review from a file, pasted text, or the labelled sample contract.
 *
 * Parsing happens inside this call so an unreadable file fails here, on the form, with a
 * sentence the reader can act on — and before any credit is spent.
 */
export async function startReviewAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const { user, account } = await requireUser();
  const actor = `${user.name} <${user.email}>`;
  const mode = String(formData.get("mode") ?? "file");
  const title = String(formData.get("title") ?? "").trim() || undefined;
  const counterparty = String(formData.get("counterparty") ?? "").trim() || undefined;

  try {
    let source: Parameters<typeof createReview>[0]["source"];

    if (mode === "sample") {
      const fixture = fixtureByKey(String(formData.get("sample") ?? ""));
      if (!fixture) return { error: "That sample is not available." };
      source = { kind: "text", text: fixture.text, filename: `${fixture.key}.txt` };
    } else if (mode === "paste") {
      const text = String(formData.get("text") ?? "");
      if (text.trim().length < 200) {
        return { error: "Paste the whole contract — a couple of hundred characters is not enough to review." };
      }
      source = { kind: "text", text };
    } else {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return { error: "Choose a PDF or DOCX file, or paste the text instead." };
      }
      if (file.size > MAX_BYTES) {
        return { error: `That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB, over the 12MB limit.` };
      }
      const kind: SourceKind = file.name.toLowerCase().endsWith(".pdf")
        ? "pdf"
        : file.name.toLowerCase().endsWith(".docx")
          ? "docx"
          : "text";
      if (kind === "text") {
        return { error: "ClauseCompass reads PDF and DOCX files. For anything else, paste the text." };
      }
      source = {
        kind,
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
      };
    }

    const result = await createReview({ account, actor, title, counterparty, source });
    revalidatePath("/contracts");
    // The processing screen is the contract's own page; it advances the pipeline.
    return { error: null, contractId: result.contractId };
  } catch (err) {
    if (err instanceof NoCreditsError) {
      return {
        error: "You have no reviews left. One review is $19, or 5 a month on Freelancer.",
        needsCredits: true,
      };
    }
    if (err instanceof ParseError) return { error: err.message };
    console.error("[startReview] failed", err);
    return { error: "Something went wrong reading that document. Try again, or paste the text." };
  }
}

/** One pipeline stage per call — what the processing screen polls. */
export async function advanceReviewAction(contractId: string): Promise<StageProgress> {
  const { account } = await requireUser();
  const contract = await getContract(account.id, contractId);
  if (!contract) throw new Error("No such contract");
  if (contract.status === "ready" || contract.status === "failed") return progressOf(contract);
  const progress = await advanceContract(contractId);
  if (progress.done || progress.failed) revalidatePath(`/contracts/${contractId}`);
  return progress;
}

export async function confirmContractTypeAction(
  contractId: string,
  contractType: ContractType,
): Promise<void> {
  const { user, account } = await requireUser();
  await setContractType(account.id, contractId, contractType, `${user.name} <${user.email}>`);
  revalidatePath(`/contracts/${contractId}`);
}

export async function toggleRedlineAction(redlineId: string, accepted: boolean): Promise<void> {
  const { account } = await requireUser();
  await setRedlineAccepted(account.id, redlineId, accepted);
}

export async function deleteContractAction(contractId: string): Promise<void> {
  const { user, account } = await requireUser();
  await deleteContract(account.id, contractId, `${user.name} <${user.email}>`);
  revalidatePath("/contracts");
}

export async function shareReportAction(contractId: string): Promise<{ url: string }> {
  const { user, account } = await requireUser();
  const contract = await getContract(account.id, contractId);
  if (!contract) throw new Error("No such contract");
  await createShareLink(contractId, `${user.name} <${user.email}>`);
  const url = await shareUrlFor(contractId);
  revalidatePath(`/contracts/${contractId}`);
  return { url: url ?? "" };
}

export async function revokeShareAction(contractId: string): Promise<void> {
  const { user, account } = await requireUser();
  const contract = await getContract(account.id, contractId);
  if (!contract) throw new Error("No such contract");
  await revokeShareLink(contractId, `${user.name} <${user.email}>`);
  revalidatePath(`/contracts/${contractId}`);
}
