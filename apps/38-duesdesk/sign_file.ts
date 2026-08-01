import { closeDb, getDb } from "@/db";
import { documents } from "@/db/schema";
import { documentUrl } from "@/lib/documents";
async function main() {
  const db = getDb();
  const rows = await db.select().from(documents);
  const doc = rows.find((d) => d.memberVisible)!;
  console.log("URL " + (await documentUrl(doc)));
  console.log("KEY " + doc.storageKey);
  await closeDb();
}
main();
