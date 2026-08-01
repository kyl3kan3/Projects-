import "@/lib/load-env";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { users } from "@/db/schema";
async function main(){
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.email, process.argv[2]));
  const token = await new SignJWT({ userId: u.id, email: u.email })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  console.log(token);
  await closeDb();
}
main();
