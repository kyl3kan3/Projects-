/**
 * src/lib/adherence.ts
 *
 * The retention product: who trained, who's mid-week, who drifted.
 * Drift = last opened_at older than the trainer's threshold (default
 * 5 days) on an active assignment. The flag renders for the COACH —
 * never messages the client.
 *
 * TODO:
 * - [ ] dashboardRows(trainerId): per active client — yesterday's tick
 *       row, program position, last activity, drift flag, unreviewed
 *       check-ins.
 * - [ ] driftingClients(trainerId, today): the nightly job's query.
 * - [ ] morningDigest(trainerId): compose the one email (quiet line on
 *       all-green days).
 */

export interface DashboardRow {
  clientId: string;
  name: string;
  lastOpenedAt: string | null;
  drifting: boolean;
  programPosition: string;
  checkinsWaiting: number;
}

export async function dashboardRows(trainerId: string): Promise<DashboardRow[]> {
  throw new Error("Not implemented");
}
