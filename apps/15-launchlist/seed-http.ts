import "@/lib/load-env";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createList } from "@/lib/lists";

async function main() {
  const db = getDb();
  await db.delete(users).where(sql`${users.email} like 'http-%'`);
  const [u] = await db.insert(users).values({ email: "http-founder@example.com", name: "Sofia", passwordHash: await hashPassword("supersecret1"), plan: "pro" }).returning();
  const list = await createList(u, { name: "Tideline" });
  console.log(JSON.stringify({ userId: u.id, listId: list.id, slug: list.slug }));
  await closeDb();
}
main();
