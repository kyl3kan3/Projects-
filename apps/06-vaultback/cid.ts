import "@/lib/load-env";
import { getDb, closeDb } from "@/db";
import { databaseConnections } from "@/db/schema";
async function main(){ const db=getDb(); const [c]=await db.select().from(databaseConnections); console.log(c.id); await closeDb(); }
main();
