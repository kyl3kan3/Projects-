/**
 * src/lib/approvals.ts
 *
 * The authorization trail: per-line decisions recorded immutably
 * (decision, timestamp, ip, user-agent, token hash). The thing that
 * settles "I never OK'd that".
 *
 * TODO:
 * - [ ] recordDecisions(token, decisions, request): validate the
 *       token, write approvals rows + flip estimate_lines statuses in
 *       one transaction; re-submission of the same line is a NEW
 *       approvals row (history), latest wins on the line.
 * - [ ] decisionSummary(inspectionId): approved/declined/waiting
 *       counts + total approved cents for the board.
 * - [ ] Estimate edits after send: audit_log with old/new values.
 */

export interface LineDecision {
  estimateLineId: string;
  decision: "approved" | "declined";
}

export async function recordDecisions(
  token: string,
  decisions: LineDecision[],
  requestMeta: { ip: string | null; userAgent: string | null },
): Promise<{ recorded: number }> {
  throw new Error("Not implemented");
}
