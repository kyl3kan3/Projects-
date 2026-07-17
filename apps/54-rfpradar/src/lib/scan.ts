/**
 * src/lib/scan.ts
 *
 * The morning scan — the 6am artifact. Composes one email and/or Slack
 * post per firm at their local scan hour: new matches by score, changed
 * deadlines on watched/pursued notices, pursuits expiring within 7 days,
 * and per-source health.
 *
 * Law: the scan ALWAYS sends. A no-new-matches morning sends the one
 * quiet line ("No new matches. 3,412 notices scanned across 6 sources.")
 * — silence must be distinguishable from breakage.
 *
 * TODO:
 * - [ ] composeScan(firmId): gather sections; return null NEVER — the
 *       quiet-line variant is still a scan.
 * - [ ] renderScanEmail(scan): React Email or plain HTML per DESIGN.md
 *       type roles; factors rendered verbatim.
 * - [ ] renderScanSlack(scan): Block Kit JSON for the firm's incoming
 *       webhook URL.
 * - [ ] sendScan(firmId): email via Resend + Slack post; record a
 *       notifications row per recipient; honor env.dryRun.
 */

export interface ScanSection {
  kind: "new_matches" | "date_changes" | "expiring_pursuits" | "source_health";
  title: string;
  items: Array<Record<string, unknown>>;
}

export interface MorningScan {
  firmId: string;
  scannedCount: number;
  sourceCount: number;
  sections: ScanSection[];
  quiet: boolean;
}

export async function composeScan(firmId: string): Promise<MorningScan> {
  throw new Error("Not implemented");
}

export async function sendScan(firmId: string): Promise<{ email: boolean; slack: boolean }> {
  throw new Error("Not implemented");
}
