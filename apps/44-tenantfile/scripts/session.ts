import "@/lib/load-env";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { users } from "@/db/schema";

async function main() {
  const [user] = await getDb().select().from(users).where(eq(users.email, "walkthrough@tenantfile.test"));
  if (!user) throw new Error("seed first");
  const token = await new SignJWT({ userId: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  console.log(token);
  await closeDb();
}
void main();
