/**
 * src/lib/library.ts
 *
 * The answer library: reusable boilerplate, past answers, bios, and past
 * performance — with link-and-snapshot semantics. Linking a block into a
 * pursuit freezes its body in block_uses; library edits NEVER rewrite
 * submitted history.
 *
 * TODO:
 * - [ ] createBlock / updateBlock (bump version, reset lastReviewedAt on
 *       review, audit_log every edit).
 * - [ ] linkBlock(pursuitId, blockId, requirementLabel): snapshot body +
 *       version into block_uses; surface staleness at link time
 *       ("bio last reviewed Jan 2025 — review before use?").
 * - [ ] markWonWith(pursuitId): on a won pursuit, flag its used blocks
 *       won_with = true — the library learns which answers win.
 * - [ ] searchBlocks(firmId, query, tags): postgres full-text over
 *       title + body + tags.
 * - [ ] exportLibrary(firmId): JSON + zip of every block — the
 *       anti-lock-in promise; must work even in read-only dunning mode.
 */

export async function linkBlock(input: {
  pursuitId: string;
  answerBlockId: string;
  requirementLabel: string;
  linkedByUserId: string;
}): Promise<{ blockUseId: string; staleWarning: string | null }> {
  throw new Error("Not implemented");
}

export async function markWonWith(pursuitId: string): Promise<{ flagged: number }> {
  throw new Error("Not implemented");
}

export async function exportLibrary(firmId: string): Promise<{ json: string }> {
  throw new Error("Not implemented");
}
