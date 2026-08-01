/**
 * The request sweep, as a command you can run.
 *
 * In production the sweep runs as a cron-triggered route
 * (src/app/api/cron/tick/route.ts) because Vercel has no always-on processes.
 * This is the same function driven from a terminal, which is what you want when
 * developing ("did that request actually go out?") and what you would point a
 * host's scheduler at if you moved the web tier somewhere with real processes.
 *
 *   npm run sweep          # send everything due
 *   npm run sweep -- --dry # show what is due and send nothing
 */

import "@/lib/load-env";
import { and, asc, eq, lte } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { orders, reviewRequests } from "@/db/schema";
import { sweepDueRequests } from "@/lib/requests";

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const db = getDb();

  const due = await db
    .select({ request: reviewRequests, order: orders })
    .from(reviewRequests)
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .where(and(eq(reviewRequests.status, "scheduled"), lte(reviewRequests.scheduledAt, new Date())))
    .orderBy(asc(reviewRequests.scheduledAt))
    .limit(50);

  console.log(`${due.length} request${due.length === 1 ? "" : "s"} due:`);
  for (const row of due) {
    console.log(
      `  ${row.request.scheduledAt.toISOString()}  ${row.order.customerEmail}  ${row.order.orderNumber ?? row.order.externalId}`,
    );
  }

  if (dry) {
    console.log("--dry: nothing sent.");
    await closeDb();
    return;
  }

  const result = await sweepDueRequests({ limit: 200 });
  console.log(
    `sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}, deferred ${result.deferred}`,
  );
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
