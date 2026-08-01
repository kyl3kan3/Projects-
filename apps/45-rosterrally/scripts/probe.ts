import { loadEnvLocal } from "../src/lib/load-env";
loadEnvLocal();
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { claimSlot } from "../src/lib/volunteers";
import { volunteerSlots, households } from "../src/db/schema";

async function main() {
  const db = getDb();
  const rows = await db.execute(sql`select id, capacity, role, starts_at, club_id from volunteer_slots limit 1`);
  console.log("isArray", Array.isArray(rows), "keys", Object.keys(rows as object).slice(0, 6));
  console.log(JSON.stringify(rows).slice(0, 300));
  await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`select id, capacity, role, starts_at from volunteer_slots limit 1 for update`);
    console.log("tx isArray", Array.isArray(locked));
    console.log("tx json", JSON.stringify(locked).slice(0, 300));
  });
  const [slot] = await db.select().from(volunteerSlots).limit(1);
  const [hh] = await db.select().from(households).limit(1);
  console.log("direct claim:", JSON.stringify(await claimSlot(slot.id, hh.id)));
  await closeDb();
}
main();
