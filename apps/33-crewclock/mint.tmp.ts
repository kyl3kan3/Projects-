import "./src/worker/load-env";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { organizations, users } from "@/db/schema";

async function main() {
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, "Hendricks Concrete"));
  const rows = await db.select().from(users).where(eq(users.organizationId, org.id));
  const owner = rows.find((r) => r.role === "owner")!;
  const crew = rows.find((r) => r.locale === "es")!;
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  
  async function mint(userId: string, role: string) {
    return new SignJWT({ userId, organizationId: org.id, role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(secret);
  }
  
  console.log(JSON.stringify({
    orgId: org.id,
    owner: await mint(owner.id, "owner"),
    crew: await mint(crew.id, "crew"),
    crewCode: crew.crewCode,
  }));
  await closeDb();
  
}
void main();
