/**
 * src/lib/tick.ts
 *
 * The nightly work, in one function so both runtimes call the same code: the
 * BullMQ worker's repeatable job and `/api/cron/tick` on Vercel.
 *
 * Bounded on purpose. Vercel's function ceiling is 300s and Hobby cron fires
 * once a day, so the pass works through accounts oldest-first and stops when the
 * budget runs out, reporting how far it got. Nothing is lost by stopping: the
 * reminder ledger means the next pass picks up exactly where this one left off.
 */

import { accountsToSweep, runFanOut, type FanOutSummary } from "@/lib/reminders";
import { tickBudgetMs } from "@/lib/runtime";

export interface TickResult {
  startedAt: string;
  finishedAt: string;
  accountsConsidered: number;
  accountsProcessed: number;
  rungsClaimed: number;
  emailsSent: number;
  emailsFailed: number;
  unaddressed: number;
  dryRun: boolean;
  budgetExhausted: boolean;
  perAccount: FanOutSummary[];
}

export async function runTick(options: { budgetMs?: number; today?: string } = {}): Promise<TickResult> {
  const startedAt = new Date();
  const budget = options.budgetMs ?? tickBudgetMs();
  const deadline = startedAt.getTime() + budget;

  const accounts = await accountsToSweep();
  const perAccount: FanOutSummary[] = [];
  let budgetExhausted = false;

  for (const account of accounts) {
    if (Date.now() > deadline) {
      budgetExhausted = true;
      break;
    }
    try {
      perAccount.push(await runFanOut(account, { today: options.today }));
    } catch (err) {
      console.error(`[tick] account ${account.id} failed:`, err);
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    accountsConsidered: accounts.length,
    accountsProcessed: perAccount.length,
    rungsClaimed: perAccount.reduce((s, a) => s + a.rungsClaimed, 0),
    emailsSent: perAccount.reduce((s, a) => s + a.emailsSent, 0),
    emailsFailed: perAccount.reduce((s, a) => s + a.emailsFailed, 0),
    unaddressed: perAccount.reduce((s, a) => s + a.unaddressed, 0),
    dryRun: perAccount.some((a) => a.dryRun),
    budgetExhausted,
    perAccount,
  };
}
