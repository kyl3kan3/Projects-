import "@/lib/load-env";
import { getDb, closeDb } from "@/db";
import { backupPolicies } from "@/db/schema";
import { and, asc, eq, lte } from "drizzle-orm";
import { duePolicies, dispatchDueBackups } from "@/lib/scheduler";
async function main(){
  const db = getDb();
  const all = await db.select().from(backupPolicies);
  console.log("all:", all.map(p=>({id:p.id.slice(0,8), enabled:p.enabled, next:p.nextRunAt.toISOString()})));
  console.log("now:", new Date().toISOString());
  const due = await duePolicies(50);
  console.log("due:", due.map(p=>p.id.slice(0,8)));
  const raw = await db.select().from(backupPolicies).where(and(eq(backupPolicies.enabled,true), lte(backupPolicies.nextRunAt, new Date()))).orderBy(asc(backupPolicies.nextRunAt));
  console.log("raw:", raw.map(p=>p.id.slice(0,8)));
  const d = await dispatchDueBackups(50);
  console.log("dispatch:", d.claimed, d.missed, d.skipped, d.jobs.length);
  await closeDb();
}
main();
