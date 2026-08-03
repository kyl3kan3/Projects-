"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/auth";
import { resendProposal, withdrawProposal } from "@/lib/proposals";

export interface ProposalActionState {
  error?: string;
  url?: string;
  emailed?: boolean;
}

export async function resendProposalAction(proposalId: string): Promise<ProposalActionState> {
  const { org, user } = await requireOnboardedUser();
  const result = await resendProposal(org, user.id, proposalId);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/proposals/${proposalId}`);
  return { url: result.url, emailed: result.emailed };
}

export async function withdrawProposalAction(proposalId: string): Promise<ProposalActionState> {
  const { org, user } = await requireOnboardedUser();
  const result = await withdrawProposal(org, user.id, proposalId);
  if (!result.ok) return { error: result.error ?? "Could not withdraw this proposal." };
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return {};
}
