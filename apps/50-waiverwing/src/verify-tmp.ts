/** Throwaway end-to-end verification against the real database. */
import "@/lib/load-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb, getSql } from "@/db";
import {
  accounts,
  locations,
  participants,
  signatures,
  users,
  waivers,
  waiverVersions,
  DEFAULT_MINOR_RULE,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { newQrToken, issueLinkToken, verifyLinkToken, resolveSignToken, renderQrSvg, signUrl } from "@/lib/qr";
import { createWaiver, publish, renderVersionText, updateDraft, hashText, liveVersion } from "@/lib/waivers";
import { captureSigning, monthlyVolume, verifySignatureEvidence, evidenceSummary } from "@/lib/signatures";
import { checkIn, todayBoard, CoverageError } from "@/lib/checkin";
import { createIncident, linkParticipant, incidentFile, signatureInForce } from "@/lib/incidents";
import { searchParticipants, participantCoverage, deriveCoverage } from "@/lib/search";
import { renderSignedWaiverPdf, bulkExportPdf, bulkExportCsv, incidentFilePdf } from "@/lib/pdf";
import { softCapState } from "@/lib/plans";
import { TEMPLATES } from "@/lib/templates";
import { addDays } from "@/lib/time";

const TZ = "America/Denver";
const EMAIL = "verify@waiverwing.test";
const results: string[] = [];
function pass(m: string) { results.push(`PASS ${m}`); console.log(`  PASS ${m}`); }

async function main() {
  const db = getDb();
  const [old] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (old) await db.delete(accounts).where(eq(accounts.id, old.accountId));

  const [account] = await db.insert(accounts).values({ name: "Verify Gym", plan: "counter", trialEndsAt: null }).returning();
  await db.insert(users).values({ accountId: account.id, email: EMAIL, name: "V", passwordHash: await hashPassword("password123"), role: "owner" });
  const [location] = await db.insert(locations).values({
    accountId: account.id, name: "Verify Gym — Denver", timezone: TZ, kioskPin: "1234", qrToken: newQrToken(),
  }).returning();

  const template = TEMPLATES.find((t) => t.key === "climbing")!;
  const waiver = await createWaiver({
    accountId: account.id, title: "Verify climbing waiver", expiryRule: "days_365",
    minorRule: DEFAULT_MINOR_RULE, activityTags: [], draftBlocks: template.blocks,
  });
  const v1 = await publish(waiver.id, account.id);
  pass(`published v${v1.version}, hash ${v1.textHash.slice(0, 12)}`);

  // Token resolution
  const resolved = await resolveSignToken(location.qrToken);
  assert.equal(resolved.kind, "ok");
  assert.equal(resolved.kind === "ok" && resolved.version.id, v1.id);
  pass("poster token resolves to the live version");

  const badToken = await resolveSignToken("not-a-real-token");
  assert.equal(badToken.kind, "unknown");
  pass("unknown token returns a typed dead end");

  const expired = issueLinkToken({ locationId: location.id }, -10);
  assert.equal(verifyLinkToken(expired).kind, "expired");
  const tampered = issueLinkToken({ locationId: location.id }).replace(/.$/, "x");
  assert.ok(["invalid", "expired"].includes(verifyLinkToken(tampered).kind));
  pass("link tokens: expiry and HMAC tamper both rejected");

  const svg = await renderQrSvg(signUrl(location.qrToken));
  assert.match(svg, /^<\?xml|^<svg/);
  pass(`QR SVG rendered (${svg.length} bytes)`);

  const answers = {
    emergency_name: "Priya Raman", emergency_phone: "3035550142",
    emergency_relationship: "Partner", first_visit: "yes",
  };
  const initials = { clause_belay: "AB", clause_ground_fall: "AB", clause_supervision: "AB" };
  const base = {
    accountId: account.id, locationId: location.id, timeZone: TZ, version: v1,
    channel: "qr" as const, ip: "198.51.100.9", userAgent: "verify/1.0",
    answers, initials, signatureKind: "typed" as const, disclosureAccepted: true,
  };

  // --- adult signing ---
  const adult = await captureSigning({
    ...base,
    signer: { firstName: "Sam", lastName: "Nguyen", dob: "1991-08-04", email: "SAM@Example.com ", phone: "(303) 555-0117" },
    signatureData: "Sam Nguyen",
  });
  assert.equal(adult.signatureIds.length, 1);
  const [samSig] = await db.select().from(signatures).where(eq(signatures.id, adult.signatureIds[0]));
  assert.equal(samSig.ip, "198.51.100.9");
  assert.equal(samSig.userAgent, "verify/1.0");
  assert.ok(samSig.signedText.includes("Acknowledgement of risk"));
  assert.equal(samSig.textHash, createHash("sha256").update(samSig.signedText, "utf8").digest("hex"));
  assert.equal(samSig.textHash, v1.textHash);
  pass("adult signature stores text + independent-hash match + ip + ua");

  const [samP] = await db.select().from(participants).where(eq(participants.id, adult.participantIds[0]));
  assert.equal(samP.email, "sam@example.com");
  assert.equal(samP.phone, "3035550117");
  assert.deepEqual(samP.emergencyContact, { name: "Priya Raman", phone: "3035550142", relationship: "Partner" });
  pass("email/phone normalised at write time; emergency contact derived");

  // --- minor cannot sign for themselves ---
  await assert.rejects(
    captureSigning({ ...base, signer: { firstName: "Kid", lastName: "Young", dob: "2012-04-09" }, signatureData: "Kid Young" }),
    /under 18, so you cannot sign this waiver yourself/,
  );
  pass("a minor signing for themselves is rejected at the server");

  // --- minor cannot sign for a sibling ---
  await assert.rejects(
    captureSigning({
      ...base,
      signer: { firstName: "Ada", lastName: "Young", dob: "2009-01-05" },
      minors: [{ firstName: "Leo", lastName: "Young", dob: "2015-11-30", relationship: "Adult sibling" }],
      signatureData: "Ada Young",
    }),
    /cannot sign a waiver/,
  );
  pass("a 17-year-old signing for a sibling is rejected");

  // --- guardian with two minors ---
  const guardian = await captureSigning({
    ...base,
    channel: "kiosk",
    signer: { firstName: "Dana", lastName: "Torres", dob: "1988-06-14", email: "dana@example.com", phone: "3035550188" },
    minors: [
      { firstName: "Maya", lastName: "Torres", dob: "2012-04-09", relationship: "Parent", answers: { medical_flags: "Inhaler" } },
      { firstName: "Leo", lastName: "Torres", dob: "2015-11-30", relationship: "Parent" },
    ],
    signatureData: "Dana Torres",
  });
  assert.equal(guardian.signatureIds.length, 2, "one signature row per minor");
  const guardianRows = await db.select().from(signatures).where(
    and(eq(signatures.accountId, account.id), eq(signatures.minorAtSigning, true)),
  );
  assert.equal(guardianRows.length, 2);
  for (const r of guardianRows) {
    assert.equal(r.signedByParticipantId, guardian.signerParticipantId);
    assert.equal(r.guardianRelationship, "Parent");
    assert.equal(r.signerName, "Dana Torres");
    assert.equal(r.ageOfMajorityAtSigning, 18);
  }
  const minorPs = await db.select().from(participants).where(eq(participants.guardianParticipantId, guardian.signerParticipantId));
  assert.equal(minorPs.length, 2);
  assert.ok(minorPs.every((m) => m.isMinor && m.email === null && m.phone === null));
  const maya = minorPs.find((m) => m.firstName === "Maya")!;
  assert.equal(maya.flags["Injuries, conditions or medications staff should know about"], "Inhaler");
  pass("guardian flow: 2 rows, guardian link + relationship, no contact details on minors, per-minor medical flag");

  // --- THE evidence test: edit the waiver after signing ---
  const editedBlocks = template.blocks.map((b) =>
    b.key === "release"
      ? { ...b, config: { heading: "Release and waiver of claims", body: "The participant releases nothing at all and the gym accepts full liability for everything that happens on its premises, forever." } }
      : b,
  );
  await updateDraft(waiver.id, account.id, { draftBlocks: editedBlocks, title: "Verify climbing waiver (revised)" });
  const v2 = await publish(waiver.id, account.id);
  assert.equal(v2.version, 2);
  assert.notEqual(v2.textHash, v1.textHash);

  const [samAfter] = await db.select().from(signatures).where(eq(signatures.id, adult.signatureIds[0]));
  assert.equal(samAfter.signedText, samSig.signedText, "past signature text unchanged");
  assert.equal(samAfter.textHash, v1.textHash, "past signature hash unchanged");
  assert.equal(samAfter.waiverVersion, 1);
  assert.equal(samAfter.waiverTitle, "Verify climbing waiver");
  assert.ok(!samAfter.signedText.includes("accepts full liability"));
  assert.equal(verifySignatureEvidence(samAfter).ok, true);
  const [v1Row] = await db.select().from(waiverVersions).where(eq(waiverVersions.id, v1.id));
  assert.equal(v1Row.textHash, v1.textHash, "version 1 row untouched by publishing version 2");
  pass("EDITING A WAIVER AFTER SIGNING DOES NOT CHANGE PAST SIGNATURES (text, hash, title, version)");

  // Tampering with the stored text is detectable.
  await db.update(signatures).set({ signedText: samAfter.signedText + "\nSNEAKY EXTRA CLAUSE" }).where(eq(signatures.id, samAfter.id));
  const [tamperedSig] = await db.select().from(signatures).where(eq(signatures.id, samAfter.id));
  assert.equal(verifySignatureEvidence(tamperedSig).ok, false);
  assert.match(evidenceSummary(tamperedSig, samP.dob, TZ).lines.join(" "), /MISMATCH/);
  await db.update(signatures).set({ signedText: samAfter.signedText }).where(eq(signatures.id, samAfter.id));
  assert.equal(verifySignatureEvidence((await db.select().from(signatures).where(eq(signatures.id, samAfter.id)))[0]).ok, true);
  pass("altering stored waiver text is detected by the evidence check");

  // --- offline replay 5x ---
  const offlineKey = "verify-offline-key-001";
  const payload = {
    ...base,
    channel: "kiosk" as const,
    offlineKey,
    capturedAt: new Date(),
    signer: { firstName: "Ines", lastName: "Okafor", dob: "1994-03-11", email: "ines@example.com" },
    signatureData: "Ines Okafor",
  };
  const firstSync = await captureSigning(payload);
  for (let i = 0; i < 4; i++) {
    const replay = await captureSigning(payload);
    assert.equal(replay.deduped, true, `replay ${i + 2} should dedupe`);
    assert.deepEqual(replay.signatureIds, firstSync.signatureIds);
  }
  const offlineRows = await db.select().from(signatures).where(eq(signatures.offlineKey, `${offlineKey}:0`));
  assert.equal(offlineRows.length, 1, "5 syncs produce exactly one row");
  assert.ok(offlineRows[0].capturedAt);
  pass("kiosk offline sync replayed 5x produces exactly one signature row");

  // Guardian session offline replay (multi-row keys)
  const gKey = "verify-offline-guardian";
  const gPayload = {
    ...base, channel: "kiosk" as const, offlineKey: gKey, capturedAt: new Date(),
    signer: { firstName: "Marcus", lastName: "Hale", dob: "1979-11-02", email: "marcus@example.com" },
    minors: [
      { firstName: "Nia", lastName: "Hale", dob: "2013-07-01", relationship: "Parent" },
      { firstName: "Tomas", lastName: "Hale", dob: "2016-02-14", relationship: "Parent" },
    ],
    signatureData: "Marcus Hale",
  };
  const g1 = await captureSigning(gPayload);
  const g2 = await captureSigning(gPayload);
  assert.equal(g2.deduped, true);
  assert.deepEqual(new Set(g2.signatureIds), new Set(g1.signatureIds));
  const gRows = await db.select().from(signatures).where(eq(signatures.offlineKey, `${gKey}:1`));
  assert.equal(gRows.length, 1);
  pass("guardian offline session replays to exactly one row per minor");

  // --- coverage: expired + turning 18 ---
  const expiredSign = await captureSigning({
    ...base,
    signedAt: addDays(new Date(), -400),
    signer: { firstName: "Priya", lastName: "Raman", dob: "1986-02-19", email: "priya@example.com" },
    signatureData: "Priya Raman",
  });
  const priyaCov = await participantCoverage(account.id, expiredSign.participantIds[0], { timeZone: TZ });
  assert.equal(priyaCov?.state.coverage, "expired");
  pass("a 400-day-old annual waiver reads EXPIRED");

  const turnedEighteen = new Date();
  const dobJustEighteen = new Date(Date.UTC(turnedEighteen.getUTCFullYear() - 18, turnedEighteen.getUTCMonth(), turnedEighteen.getUTCDate() - 20)).toISOString().slice(0, 10);
  const adaSign = await captureSigning({
    ...base,
    signedAt: addDays(new Date(), -200),
    signer: { firstName: "Marcus", lastName: "Hale", dob: "1979-11-02", email: "marcus@example.com" },
    minors: [{ firstName: "Ada", lastName: "Hale", dob: dobJustEighteen, relationship: "Parent" }],
    signatureData: "Marcus Hale",
  });
  const adaId = adaSign.participantIds.find((id) => id !== adaSign.signerParticipantId)!;
  const adaCov = await participantCoverage(account.id, adaId, { timeZone: TZ });
  assert.equal(adaCov?.state.coverage, "expired", "a minor who turned 18 is no longer covered");
  assert.match(adaCov?.state.reason ?? "", /before they turned 18/);
  pass("MINOR WHO TURNED 18 MID-SEASON: coverage lapses with a plain-language reason");

  // --- check-in ---
  const board0 = await todayBoard(location);
  const samCov = await participantCoverage(account.id, samP.id, { timeZone: TZ });
  assert.equal(samCov?.state.coverage, "on_file");
  const checkin = await checkIn(account.id, location.id, samP.id, { timeZone: TZ });
  assert.equal(checkin.signatureId, samCov?.state.provingSignature?.id);
  pass("check-in records the proving signature id");

  await assert.rejects(
    checkIn(account.id, location.id, adaId, { timeZone: TZ }),
    (err: unknown) => err instanceof CoverageError && /turned 18/.test((err as Error).message),
  );
  pass("check-in refuses an uncovered participant with the reason");

  const board1 = await todayBoard(location);
  assert.ok(board1.checkedInCount >= 1);
  assert.ok(board1.signedCount >= board0.signedCount);
  const samRow = board1.rows.find((r) => r.participantId === samP.id);
  assert.ok(samRow?.checkedInAt);
  assert.equal(samRow?.coverage, "on_file");
  const mayaRow = board1.rows.find((r) => r.displayName === "Maya Torres");
  assert.equal(mayaRow?.isMinor, true);
  assert.equal(mayaRow?.guardianName, "Dana Torres");
  pass(`today board: ${board1.signedCount} signed / ${board1.checkedInCount} in, guardian names present`);

  // --- search ---
  for (const q of ["torr", "Maya", "sam@", "3035550117", "3035550", "nguy"]) {
    const found = await searchParticipants(account.id, q, { timeZone: TZ });
    assert.ok(found.length > 0, `search "${q}" found nothing`);
  }
  const mayaFound = (await searchParticipants(account.id, "maya tor", { timeZone: TZ }))[0];
  assert.equal(mayaFound.displayName, "Maya Torres");
  assert.equal(mayaFound.guardianName, "Dana Torres");
  assert.equal(mayaFound.coverage, "on_file");
  const typo = await searchParticipants(account.id, "torrez", { timeZone: TZ });
  assert.ok(typo.length > 0, "trigram should tolerate a typo");
  pass("search: partial name, email, phone, and a typo all return the record with coverage");

  // --- 100k row search budget ---
  const sqlc = getSql();
  const [{ count: before }] = (await sqlc`select count(*)::int as count from participants where account_id = ${account.id}`) as unknown as [{ count: number }];
  console.log(`  (bulk-loading 100k participants for the search budget test; ${before} present)`);
  await sqlc`
    insert into participants (account_id, first_name, last_name, email, phone, dob, is_minor)
    select ${account.id},
           (array['Ana','Ben','Cleo','Dov','Esme','Finn','Gus','Hana','Ivo','Jo'])[1 + (i % 10)],
           'Bulk' || i,
           'bulk' || i || '@example.com',
           '303' || lpad((5550000 + i)::text, 7, '0'),
           '1990-01-01', false
    from generate_series(1, 100000) as i
  `;
  const [{ count: after }] = (await sqlc`select count(*)::int as count from participants where account_id = ${account.id}`) as unknown as [{ count: number }];
  await sqlc`analyze participants`;
  const timings: number[] = [];
  for (const q of ["bulk4231", "hana bulk9", "cleo", "3035559", "esme bulk1234"]) {
    const t0 = process.hrtime.bigint();
    const r = await searchParticipants(account.id, q, { timeZone: TZ });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    timings.push(ms);
    console.log(`    "${q}" -> ${r.length} rows in ${ms.toFixed(1)}ms`);
  }
  const worst = Math.max(...timings);
  pass(`search over ${after} participants: worst full round trip ${worst.toFixed(1)}ms`);

  const explain = await sqlc`
    explain (analyze, buffers)
    select p.id from participants p
    where p.account_id = ${account.id}
      and (lower(p.first_name) || ' ' || lower(p.last_name)) like 'hana bulk99987%'
    limit 25
  `;
  const plan = (explain as unknown as Array<Record<string, string>>).map((r) => Object.values(r)[0]).join("\n");
  console.log("    " + plan.split("\n").slice(0, 4).join("\n    "));
  assert.match(plan, /Bitmap Index Scan/, "a selective name prefix must use the trigram index");

  const explain2 = await sqlc`
    explain (analyze)
    select p.id from participants p
    where p.account_id = ${account.id} and lower(coalesce(p.email,'')) like '%bulk4231%'
    limit 25
  `;
  const plan2 = (explain2 as unknown as Array<Record<string, string>>).map((r) => Object.values(r)[0]).join("\n");
  assert.match(plan2, /Bitmap Index Scan/, "the email branch must use the trigram index");
  pass("EXPLAIN: name-prefix and email branches both use their trigram indexes");

  // clean the bulk rows so later assertions are not swamped
  await sqlc`delete from participants where account_id = ${account.id} and last_name like 'Bulk%'`;

  // --- incident snapshot immunity ---
  // An incident BEFORE anyone signed: the file must record no waiver in force,
  // never the waiver that turned up afterwards.
  const early = await createIncident({
    accountId: account.id, locationId: location.id,
    occurredAt: addDays(new Date(), -2),
    title: "Slip on the wet entrance mat",
    description: "Reported by a member; mat replaced the same morning.",
  });
  const earlyLink = await linkParticipant(account.id, early.id, samP.id, "Reported it", TZ);
  assert.equal(earlyLink.signatureId, null, "a waiver signed later must not be attached");
  pass("an incident predating the signature records NO WAIVER IN FORCE");

  const incident = await createIncident({
    accountId: account.id, locationId: location.id,
    occurredAt: new Date(),
    title: "Ankle roll at boulder 7",
    description: "Came off the top of the blue V3 and landed on the mat seam. Iced at the desk.",
    whereText: "Boulder 7",
  });
  const link = await linkParticipant(account.id, incident.id, samP.id, "Landed on the seam.", TZ);
  assert.equal(link.signatureId, samSig.id, "incident links the waiver in force at occurred_at");

  // Sam re-signs on the NEW version. The incident file must not move.
  const resign = await captureSigning({
    ...base,
    version: (await liveVersion(waiver.id))!,
    signer: { firstName: "Sam", lastName: "Nguyen", dob: "1991-08-04", email: "sam@example.com", phone: "3035550117" },
    signatureData: "Sam Nguyen",
  });
  assert.notEqual(resign.signatureIds[0], samSig.id);
  const fileAfter = await incidentFile(account.id, incident.id);
  const entry = fileAfter!.entries.find((e) => e.participant.id === samP.id)!;
  assert.equal(entry.signature?.id, samSig.id, "still the old signature");
  assert.equal(entry.signature?.waiverVersion, 1);
  assert.ok(!entry.signature!.signedText.includes("accepts full liability"));
  // Re-linking must not re-resolve either.
  const relink = await linkParticipant(account.id, incident.id, samP.id, "again", TZ);
  assert.equal(relink.signatureId, samSig.id);
  pass("INCIDENT SNAPSHOT: re-signing afterwards does not change the incident file");

  // Someone with no waiver at the time is recorded honestly.
  const [ghost] = await db.insert(participants).values({
    accountId: account.id, firstName: "Owen", lastName: "Bell", dob: "1990-05-05", isMinor: false, flags: {},
  }).returning();
  const ghostLink = await linkParticipant(account.id, incident.id, ghost.id, "Bystander", TZ);
  assert.equal(ghostLink.signatureId, null);
  pass("a participant with no waiver in force links with an explicit null, not a later waiver");

  const inForceNow = await signatureInForce(samP.id, new Date(), TZ);
  assert.equal(inForceNow?.id, resign.signatureIds[0]);
  pass("waiver-in-force at 'now' resolves to the newest valid signature");

  // --- soft caps never block ---
  const vol = await monthlyVolume(account.id);
  assert.ok(vol > 0);
  assert.equal(softCapState("counter", 100000), "over");
  const overCap = await captureSigning({
    ...base,
    signer: { firstName: "Rae", lastName: "Kim", dob: "1990-09-09", email: "rae@example.com" },
    signatureData: "Rae Kim",
  });
  assert.equal(overCap.signatureIds.length, 1);
  pass(`soft cap over (${vol} this month on a 200 cap) and signing still succeeded`);

  // --- PDFs ---
  const pdf = await renderSignedWaiverPdf(account.id, samSig.id, { generatedAt: new Date("2026-03-02T09:41:00Z") });
  assert.ok(pdf);
  assert.equal(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1"), "%PDF-");
  const pdf2 = await renderSignedWaiverPdf(account.id, samSig.id, { generatedAt: new Date("2026-03-02T09:41:00Z") });
  assert.equal(pdf2!.pageCount, pdf.pageCount, "deterministic page count");
  assert.equal(pdf2!.bytes.byteLength, pdf.bytes.byteLength, "deterministic byte length");
  pass(`single waiver PDF: ${pdf.pageCount} pages, ${pdf.bytes.byteLength} bytes, deterministic`);

  const drawnSign = await captureSigning({
    ...base,
    signatureKind: "drawn",
    signatureData: "M10 40 L30 20 L50 45 L70 15 L90 40",
    signer: { firstName: "Wren", lastName: "Ashby", dob: "1988-01-20", email: "wren@example.com" },
  });
  const drawnPdf = await renderSignedWaiverPdf(account.id, drawnSign.signatureIds[0], { generatedAt: new Date("2026-03-02T09:41:00Z") });
  assert.ok(drawnPdf && drawnPdf.bytes.byteLength > 1000);
  pass(`drawn signature renders into the PDF (${drawnPdf!.bytes.byteLength} bytes)`);

  const bulk = await bulkExportPdf(account.id, { from: addDays(new Date(), -500), to: new Date() });
  assert.ok(bulk.included >= 8, `expected several records, got ${bulk.included}`);
  assert.equal(Buffer.from(bulk.bytes.slice(0, 5)).toString("latin1"), "%PDF-");
  pass(`bulk export: ${bulk.included} records, ${bulk.pageCount} pages, truncated=${bulk.truncated}`);

  const csv = await bulkExportCsv(account.id, { from: addDays(new Date(), -500), to: new Date() });
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^participant_last_name,participant_first_name/);
  assert.ok(lines.length >= 9);
  assert.ok(csv.includes("Torres"), "CSV holds the guardian-signed minors");
  assert.ok(/,yes,/.test(csv), "CSV marks minor_at_signing");
  pass(`CSV export: ${lines.length - 1} rows with minor + guardian columns`);

  const incPdf = await incidentFilePdf(account.id, incident.id, { generatedAt: new Date("2026-03-02T09:41:00Z") });
  assert.ok(incPdf);
  assert.ok(incPdf!.pageCount >= 2);
  pass(`incident file PDF: ${incPdf!.pageCount} pages`);

  // --- exports audit ---
  const exportRows = (await sqlc`select kind, count(*)::int as n from exports where account_id = ${account.id} group by kind`) as unknown as Array<{ kind: string; n: number }>;
  assert.ok(exportRows.length >= 2, "exports are audited");
  pass(`export audit rows: ${exportRows.map((r) => `${r.kind}=${r.n}`).join(", ")}`);

  // --- guardian who is exactly at majority boundary ---
  const nowY = new Date().getUTCFullYear();
  const exactly18 = new Date(Date.UTC(nowY - 18, new Date().getUTCMonth(), new Date().getUTCDate())).toISOString().slice(0, 10);
  const boundary = await captureSigning({
    ...base,
    signer: { firstName: "Kai", lastName: "Ito", dob: exactly18, email: "kai@example.com" },
    minors: [{ firstName: "Sora", lastName: "Ito", dob: "2015-04-04", relationship: "Adult sibling" }],
    signatureData: "Kai Ito",
  });
  assert.equal(boundary.signatureIds.length, 1);
  pass("someone whose 18th birthday is today may sign");

  const tomorrow18 = new Date(Date.UTC(nowY - 18, new Date().getUTCMonth(), new Date().getUTCDate() + 1)).toISOString().slice(0, 10);
  await assert.rejects(captureSigning({
    ...base,
    signer: { firstName: "Rin", lastName: "Ito", dob: tomorrow18 },
    minors: [{ firstName: "Sora", lastName: "Ito", dob: "2015-04-04", relationship: "Adult sibling" }],
    signatureData: "Rin Ito",
  }), /cannot sign/);
  pass("someone whose 18th birthday is tomorrow may not sign");

  // --- validation gates ---
  await assert.rejects(captureSigning({ ...base, disclosureAccepted: false, signer: { firstName: "A", lastName: "B", dob: "1990-01-01" }, signatureData: "A B" }), /consent box/);
  await assert.rejects(captureSigning({ ...base, initials: { clause_belay: "AB" }, signer: { firstName: "A", lastName: "B", dob: "1990-01-01" }, signatureData: "A B" }), /Initial the clause/);
  await assert.rejects(captureSigning({ ...base, answers: {}, signer: { firstName: "A", lastName: "B", dob: "1990-01-01" }, signatureData: "A B" }), /is required/);
  await assert.rejects(captureSigning({ ...base, signer: { firstName: "A", lastName: "B", dob: "1990-01-01" }, signatureData: "Ab" }), /full name/);
  pass("gates: disclosure, every clause initialed, required answers, typed name length");

  // --- visit-rule expiry ---
  const visitWaiver = await createWaiver({
    accountId: account.id, title: "Day-pass waiver", expiryRule: "visit",
    minorRule: DEFAULT_MINOR_RULE, draftBlocks: template.blocks,
  });
  const visitV = await publish(visitWaiver.id, account.id);
  const visitSign = await captureSigning({
    ...base, version: visitV,
    signer: { firstName: "Nils", lastName: "Berg", dob: "1993-06-06", email: "nils@example.com" },
    signatureData: "Nils Berg",
  });
  const nilsCov = await participantCoverage(account.id, visitSign.participantIds[0], { timeZone: TZ });
  assert.equal(nilsCov?.state.coverage, "visitor");
  const tomorrowCov = deriveCoverage(
    await db.select().from(signatures).where(eq(signatures.participantId, visitSign.participantIds[0])),
    "1993-06-06", addDays(new Date(), 2), TZ,
  );
  assert.equal(tomorrowCov.coverage, "expired");
  pass("single-visit waiver reads VISITOR today and EXPIRED the day after");

  console.log(`\n${results.length} checks passed.`);
  await db.delete(accounts).where(eq(accounts.id, account.id));
  await closeDb();
}

main().catch(async (err) => {
  console.error("\nFAILED:", err);
  await closeDb();
  process.exit(1);
});
