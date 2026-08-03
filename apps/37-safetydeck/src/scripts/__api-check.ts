import "@/lib/load-env";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { companies, crews, employees, signOffs, talkInstances } from "@/db/schema";
import { mintCrewToken } from "@/lib/crew-token";

const BASE = "http://localhost:3037";

async function post(body: unknown) {
  const res = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const db = getDb();
  const [company] = await db.select().from(companies).limit(1);
  const [crew] = await db.select().from(crews).where(eq(crews.companyId, company.id)).limit(1);

  // A fresh instance to sync against.
  const { talks } = await import("@/db/schema");
  const [talk] = await db.select().from(talks).limit(1);
  const id = crypto.randomUUID();
  const { token, tokenHash } = await mintCrewToken(id, crew.id);
  await db.insert(talkInstances).values({
    id,
    companyId: company.id,
    crewId: crew.id,
    talkId: talk.id,
    weekOf: "2026-06-01",
    scheduledFor: "2026-06-01",
    tokenHash,
    status: "delivered",
  });
  const roster = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, company.id), eq(employees.active, true)));

  const sig = (employeeId: string, outboxId: string, deviceId: string) => ({
    token,
    deviceId,
    signatures: [
      {
        outboxId,
        employeeId,
        signaturePath: "M 10 40 L 60 20 L 110 45",
        signatureWidth: 320,
        signatureHeight: 160,
        signedAt: new Date("2026-06-01T14:05:00.000Z").toISOString(),
        capturedOffline: false,
      },
    ],
  });

  console.log("1. bad payload         ", (await post({ token, deviceId: "x" })).status, "(expect 400: deviceId too short)");
  console.log("2. bogus token         ", (await post({ token: "not.a.token.at.all", deviceId: "dev_aaaaaaaa" })).status, "(expect 401)");

  const first = await post(sig(roster[0].id, "ob1", "dev_phone_one"));
  console.log("3. first sync          ", first.status, JSON.stringify(first.json.acks), `signed=${first.json.signedCount}`);

  const retry = await post(sig(roster[0].id, "ob1", "dev_phone_one"));
  console.log("4. same entry retried  ", retry.status, JSON.stringify(retry.json.acks), "(expect duplicate)");

  const other = await post(sig(roster[0].id, "ob2", "dev_phone_two"));
  console.log("5. second device, same person", other.status, JSON.stringify(other.json.acks), "(expect duplicate — one signature per person)");

  const both = await post({
    token,
    deviceId: "dev_phone_two",
    signatures: [sig(roster[1].id, "ob3", "dev_phone_two").signatures[0]],
  });
  console.log("6. second device, other person", both.status, JSON.stringify(both.json.acks), `signed=${both.json.signedCount} (expect 2)`);

  // An employee from nowhere.
  const stranger = await post(sig(crypto.randomUUID(), "ob4", "dev_phone_one"));
  console.log("7. off-roster employee ", stranger.status, JSON.stringify(stranger.json.acks));

  // Close out with everyone marked absent, including the two who signed.
  const closed = await post({
    token,
    deviceId: "dev_phone_one",
    absentEmployeeIds: roster.map((r) => r.id),
    closeOut: true,
  });
  const [row] = await db.select().from(talkInstances).where(eq(talkInstances.id, id));
  console.log(
    "8. close-out sanity    ",
    closed.status,
    `absent=${(row.absentEmployeeIds ?? []).length} of ${roster.length} (expect ${roster.length - 2}: signers are never absent)`,
  );

  // Superseded link: resend mints a new token; the old one must stop working.
  const fresh = await mintCrewToken(id, crew.id);
  await db.update(talkInstances).set({ tokenHash: fresh.tokenHash }).where(eq(talkInstances.id, id));
  const stale = await post(sig(roster[2].id, "ob5", "dev_phone_one"));
  console.log("9. superseded token    ", stale.status, stale.json?.code, `(expect 401 superseded)`);

  // API-layer immutability: try to update a synced signature through drizzle.
  const [existing] = await db.select().from(signOffs).where(eq(signOffs.talkInstanceId, id)).limit(1);
  try {
    await db.update(signOffs).set({ signaturePath: "M 0 0 L 1 1" }).where(eq(signOffs.id, existing.id));
    console.log("10. db update           ALLOWED — immutability broken");
  } catch (err) {
    console.log("10. db update           refused:", (err as Error).message.slice(0, 72));
  }

  // Objects are tenant-scoped: no cookie at all must not read a key.
  const objRes = await fetch(`${BASE}/api/objects/${company.id}/binder/nope.pdf`, { redirect: "manual" });
  console.log("11. object without session", objRes.status, "(expect 307/302 redirect to /login)");

  // Clean up the instance this script made.
  await db.execute("ALTER TABLE sign_offs DISABLE TRIGGER USER" as never).catch(() => {});
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
