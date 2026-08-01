/** Throwaway: seed an issue, documents and portal tokens for the HTTP checks. */
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { associations, households, members, users } from "@/db/schema";
import { appendEvent, createIssue } from "@/lib/issues";
import { uploadDocument } from "@/lib/documents";
import { mintPortalToken, mintStepUpToken } from "@/lib/portal";
import { enroll } from "@/lib/autopay";

async function main() {
  const db = getDb();
  const [assoc] = await db.select().from(associations);
  const [boardUser] = await db.select().from(users).where(eq(users.associationId, assoc.id));
  const actor = { kind: "user" as const, id: boardUser.id, name: boardUser.name };

  const hs = await db.select().from(households).where(eq(households.associationId, assoc.id));
  const h216 = hs.find((h) => h.unitLabel === "216 Maple St")!;
  const h204 = hs.find((h) => h.unitLabel === "204 Maple St")!;

  const issue = await createIssue(
    {
      associationId: assoc.id,
      householdId: h216.id,
      kind: "violation",
      title: "Fence height exceeds 6 ft on the Maple St side",
      body: "Measured 7 ft 4 in during the Apr 12 walkthrough.",
      visibility: "member_visible",
    },
    actor,
  );
  await appendEvent(
    issue.id,
    {
      body: "BOARDONLYSECRET: counsel says wait 30 days before any fine is considered.",
      visibility: "board_only",
    },
    actor,
  );
  await appendEvent(
    issue.id,
    { body: "Photos from the walkthrough are on file.", visibility: "member_visible" },
    actor,
  );

  await uploadDocument(
    {
      associationId: assoc.id,
      title: "Bylaws",
      category: "bylaws",
      versionLabel: "v2 (2019 amendment)",
      memberVisible: true,
      filename: "bylaws.pdf",
      contentType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 bylaws"),
    },
    actor,
  );
  await uploadDocument(
    {
      associationId: assoc.id,
      title: "Board minutes (draft)",
      category: "minutes",
      versionLabel: "v1",
      memberVisible: false,
      filename: "min.txt",
      contentType: "text/plain",
      bytes: Buffer.from("BOARDONLYMINUTES"),
    },
    actor,
  );

  await enroll(
    {
      householdId: h204.id,
      stripeCustomerId: "cus_local",
      stripePaymentMethodId: "pm_local",
      method: "ach",
      memberId: null,
    },
    actor,
  );

  const [harold] = await db.select().from(members).where(eq(members.householdId, h216.id));
  const [rosa] = await db.select().from(members).where(eq(members.householdId, h204.id));

  console.log(
    "SEED " +
      JSON.stringify({
        issueId: issue.id,
        issueNumber: issue.number,
        h216: h216.id,
        h204: h204.id,
        haroldToken: await mintPortalToken(harold.id),
        rosaToken: await mintPortalToken(rosa.id),
        rosaStepUp: await mintStepUpToken(rosa.id),
        haroldStepUp: await mintStepUpToken(harold.id),
      }),
  );
  await closeDb();
}

main();
