/** Throwaway: mint fresh single-use magic links for the HTTP verification run. */
import "@/lib/load-env";
import { readFile, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { contacts, portals } from "@/db/schema";
import { createMagicToken } from "@/lib/magic-auth";

const handlesPath = "/tmp/claude-0/clientdock-handles.json";

async function tokenFor(slug: string) {
  const db = getDb();
  const [portal] = await db.select().from(portals).where(eq(portals.slug, slug));
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.clientId, portal.clientId!));
  const { token } = await createMagicToken({ portalId: portal.id, contactId: contact.id });
  return token;
}

async function main() {
  const handles = JSON.parse(await readFile(handlesPath, "utf8"));
  handles.tokenA = await tokenFor(handles.slugA);
  handles.tokenB = await tokenFor(handles.slugB);
  await writeFile(handlesPath, JSON.stringify(handles, null, 2));
  console.log("minted fresh tokens");
  await closeDb();
}

main();
