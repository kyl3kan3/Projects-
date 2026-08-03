import { config } from "dotenv";
config({ path: [".env.local"], quiet: true });
import { desc } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { proposals } from "@/db/schema";
import { mintProposalToken, proposalUrl } from "@/lib/tokens";

async function main() {
  const db = getDb();
  const [p] = await db.select().from(proposals).orderBy(desc(proposals.sentAt)).limit(1);
  console.log(proposalUrl(await mintProposalToken(p.id, p.tokenId)));
  await closeDb();
}
void main();
