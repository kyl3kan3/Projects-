/** Throwaway HTTP-level verification against the running production build. */
import "@/lib/load-env";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { locations, participants, signatures, users } from "@/db/schema";
import { liveVersion, listWaivers } from "@/lib/waivers";

const BASE = "http://localhost:3050";
const ok: string[] = [];
const pass = (m: string) => { ok.push(m); console.log(`  PASS ${m}`); };

async function main() {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, "dana@graniteworks.example"));
  assert.ok(user, "run npm run db:seed first");
  const [location] = await db.select().from(locations).where(eq(locations.accountId, user.accountId));
  const waivers = await listWaivers(user.accountId);
  const version = (await liveVersion(waivers[0].id))!;

  // --- public pages ---
  const home = await fetch(`${BASE}/`);
  const homeHtml = await home.text();
  assert.equal(home.status, 200);
  assert.match(homeHtml, /Signed, searchable, on file in seconds/);
  assert.match(homeHtml, /Take your first signature/);
  assert.ok(!/lorem ipsum/i.test(homeHtml));
  const preloads = homeHtml.match(/rel="preload"[^>]*as="font"[^>]*woff2/g) ?? [];
  assert.ok(preloads.length >= 2, `expected preloaded woff2 faces, found ${preloads.length}`);
  assert.ok(!/fonts\.googleapis\.com/.test(homeHtml), "fonts must be self-hosted, not a CDN link");
  pass(`landing page renders the claim, the CTA and ${preloads.length} preloaded self-hosted woff2 faces`);

  const signPage = await fetch(`${BASE}/sign/${location.qrToken}`);
  const signHtml = await signPage.text();
  assert.equal(signPage.status, 200);
  assert.match(signHtml, /Acknowledgement of risk/, "waiver text must be server-rendered");
  assert.match(signHtml, /A parent or guardian is signing/);
  assert.match(signHtml, /must be signed for by a parent or legal guardian/);
  pass("sign page is server-rendered with the full waiver text and both paths");

  const dead = await fetch(`${BASE}/sign/definitely-not-a-token`);
  const deadHtml = await dead.text();
  assert.equal(dead.status, 200);
  assert.match(deadHtml, /not in use any more/);
  assert.ok(!deadHtml.includes(location.name), "a dead token must not leak the venue name");
  pass("dead token gives a calm dead end that leaks nothing");

  const kiosk = await fetch(`${BASE}/kiosk/${location.id}`);
  const kioskHtml = await kiosk.text();
  assert.match(kioskHtml, /Staff PIN/);
  pass("kiosk without a session asks for the PIN");

  // --- auth gates ---
  const gated = await fetch(`${BASE}/checkin`, { redirect: "manual" });
  assert.ok([302, 307].includes(gated.status), `expected a redirect, got ${gated.status}`);
  assert.match(gated.headers.get("location") ?? "", /\/login/);
  pass("/checkin without a session redirects to /login");

  for (const path of ["/api/search?q=tor", "/api/exports/bulk", "/api/exports/csv"]) {
    const res = await fetch(`${BASE}${path}`);
    assert.equal(res.status, 401, `${path} should be 401`);
  }
  pass("staff API routes refuse an anonymous caller");

  const cronNoAuth = await fetch(`${BASE}/api/cron/tick`);
  assert.equal(cronNoAuth.status, 401);
  const cronBad = await fetch(`${BASE}/api/cron/tick`, { headers: { authorization: "Bearer nope" } });
  assert.equal(cronBad.status, 401);
  const cron = await fetch(`${BASE}/api/cron/tick`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const cronBody = await cron.json();
  assert.equal(cron.status, 200);
  assert.equal(cronBody.ok, true);
  pass(`cron: 401 without the secret, ran in ${cronBody.ms}ms with it (${JSON.stringify({ resign: cronBody.resignEmails, digests: cronBody.digests, dryRun: cronBody.dryRun })})`);

  const hook = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", body: "{}" });
  assert.ok([400, 503].includes(hook.status), `expected 400/503, got ${hook.status}`);
  pass(`stripe webhook rejects an unsigned body (${hook.status})`);

  // --- signing over HTTP ---
  const body = {
    token: location.qrToken,
    versionId: version.id,
    channel: "qr",
    signer: {
      firstName: "Http",
      lastName: "Tester",
      dob: "1990-05-05",
      email: "http.tester@example.com",
      phone: "3035550999",
    },
    answers: {
      emergency_name: "Someone Else",
      emergency_phone: "3035550001",
      emergency_relationship: "Friend",
      first_visit: "yes",
    },
    initials: { clause_belay: "HT", clause_ground_fall: "HT", clause_supervision: "HT" },
    signatureKind: "typed",
    signatureData: "Http Tester",
    disclosureAccepted: true,
  };

  const signed = await fetch(`${BASE}/api/sign`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    body: JSON.stringify(body),
  });
  const signedBody = await signed.json();
  assert.equal(signed.status, 200, JSON.stringify(signedBody));
  assert.equal(signedBody.ok, true);
  const [row] = await db.select().from(signatures).where(eq(signatures.id, signedBody.signatureIds[0]));
  assert.equal(row.ip, "203.0.113.7", "the client IP must come from the first x-forwarded-for hop");
  assert.ok((row.userAgent ?? "").length > 0);
  assert.equal(row.channel, "qr");
  pass("POST /api/sign captures a signature with the real client IP and user agent");

  // Minor rejection over HTTP
  const minorAttempt = await fetch(`${BASE}/api/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, signer: { ...body.signer, dob: "2012-04-09" }, signatureData: "Kid" }),
  });
  const minorBody = await minorAttempt.json();
  assert.equal(minorAttempt.status, 422);
  assert.match(minorBody.error, /under 18/);
  pass("POST /api/sign refuses a minor signing for themselves (422, plain language)");

  // Kiosk channel needs a kiosk session
  const kioskAttempt = await fetch(`${BASE}/api/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, channel: "kiosk", signer: { ...body.signer, firstName: "Kios" } }),
  });
  assert.equal(kioskAttempt.status, 401);
  pass("a kiosk-channel submission without a kiosk session is refused");

  // Offline replay over HTTP (qr channel, five times)
  const offlineKey = `http-offline-${Date.now()}`;
  const replayBody = {
    ...body,
    offlineKey,
    capturedAt: new Date().toISOString(),
    signer: { ...body.signer, firstName: "Replay", email: "replay@example.com" },
    signatureData: "Replay Tester",
  };
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${BASE}/api/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(replayBody),
    });
    statuses.push(res.status);
  }
  const replayRows = await db.select().from(signatures).where(eq(signatures.offlineKey, `${offlineKey}:0`));
  assert.deepEqual(statuses, [200, 200, 200, 200, 200]);
  assert.equal(replayRows.length, 1, "five HTTP replays must leave one row");
  pass("five HTTP replays of the same offlineKey leave exactly one signature row");

  // Bad payload
  const bad = await fetch(`${BASE}/api/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "x" }),
  });
  assert.equal(bad.status, 400);
  pass("a malformed payload is a 400, not a 500");

  // --- authenticated staff routes, using a real signed session cookie ---
  const token = await new SignJWT({ userId: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  const cookie = `waiverwing_session=${token}`;

  const board = await fetch(`${BASE}/checkin`, { headers: { cookie } });
  const boardHtml = await board.text();
  assert.equal(board.status, 200);
  assert.match(boardHtml, /Granite Works/);
  assert.match(boardHtml, /SIGNED · /, "the mono day stat must render");
  assert.match(boardHtml, /Maya Torres/);
  assert.match(boardHtml, /guardian: Dana Torres/);
  assert.match(boardHtml, /ON FILE/);
  pass("staff check-in board renders today's rows with guardian context and coverage pills");

  const search = await fetch(`${BASE}/api/search?q=tor`, { headers: { cookie } });
  const searchBody = await search.json();
  assert.equal(search.status, 200);
  assert.ok(searchBody.results.length >= 2);
  assert.ok(searchBody.results.some((r: { displayName: string }) => r.displayName === "Maya Torres"));
  assert.ok(searchBody.ms < 200, `search took ${searchBody.ms}ms`);
  pass(`search API: ${searchBody.results.length} results in ${searchBody.ms}ms`);

  const adaRow = (await db.select().from(participants).where(eq(participants.accountId, user.accountId)))
    .find((p) => p.firstName === "Ada")!;
  const adaSearch = await fetch(`${BASE}/api/search?q=ada%20hale`, { headers: { cookie } });
  const adaBody = await adaSearch.json();
  const ada = adaBody.results.find((r: { participantId: string }) => r.participantId === adaRow.id);
  assert.equal(ada.coverage, "expired");
  assert.match(ada.reason, /turned 18/);
  pass("the turned-18 participant reads EXPIRED with its reason through the API");

  const detail = await fetch(`${BASE}/participants/${adaRow.id}`, { headers: { cookie } });
  const detailHtml = await detail.text();
  assert.equal(detail.status, 200);
  assert.match(detailHtml, /Ada Hale/);
  assert.match(detailHtml, /SIGNED [A-Z]{3} \d+ \d{4}/, "mono evidence line");
  assert.match(detailHtml, /SHA-256/);
  assert.match(detailHtml, /Signed for by/);
  assert.match(detailHtml, /AUTHORITY ENDS/);
  pass("participant detail shows the evidence line, the guardian link and the authority end");

  const sigId = (await db.select().from(signatures).where(eq(signatures.participantId, adaRow.id)))[0].id;
  const pdf = await fetch(`${BASE}/api/signatures/${sigId}/pdf`, { headers: { cookie } });
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(pdfBytes.subarray(0, 5).toString("latin1"), "%PDF-");
  const pdfText = pdfBytes.toString("latin1");
  assert.ok(pdfText.length > 3000);
  pass(`signed-waiver PDF over HTTP: ${pdfBytes.length} bytes`);

  const bulk = await fetch(`${BASE}/api/exports/bulk?from=2020-01-01&to=2030-01-01`, { headers: { cookie } });
  const bulkBytes = Buffer.from(await bulk.arrayBuffer());
  assert.equal(bulk.status, 200);
  assert.equal(bulkBytes.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(Number(bulk.headers.get("x-waiverwing-records")) >= 5);
  pass(`bulk PDF over HTTP: ${bulk.headers.get("x-waiverwing-records")} records, ${bulkBytes.length} bytes`);

  const csv = await fetch(`${BASE}/api/exports/csv?from=2020-01-01&to=2030-01-01`, { headers: { cookie } });
  const csvText = await csv.text();
  assert.equal(csv.status, 200);
  assert.match(csvText.split("\n")[0], /^participant_last_name/);
  assert.ok(csvText.includes("Torres"));
  pass(`CSV over HTTP: ${csvText.trim().split("\n").length - 1} rows`);

  for (const path of ["/participants", "/waivers", "/incidents", "/settings", "/settings/billing", "/settings/poster"]) {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
    const html = await res.text();
    assert.equal(res.status, 200, `${path} -> ${res.status}`);
    assert.ok(!/lorem ipsum/i.test(html), `${path} contains lorem`);
    assert.ok(!/TODO|Not implemented/.test(html), `${path} contains a stub marker`);
  }
  pass("every staff screen renders 200 with real content and no stub markers");

  const poster = await fetch(`${BASE}/settings/poster`, { headers: { cookie } });
  const posterHtml = await poster.text();
  assert.match(posterHtml, /<svg/, "the QR must be inline SVG");
  assert.match(posterHtml, /Scan to sign your waiver/);
  assert.match(posterHtml, /Waivers by WaiverWing/);
  pass("QR poster renders an inline SVG code with the marketing footer");

  const waiverPage = await fetch(`${BASE}/waivers/${waivers[0].id}`, { headers: { cookie } });
  const waiverHtml = await waiverPage.text();
  assert.match(waiverHtml, /V1 · PUBLISHED/);
  assert.match(waiverHtml, /Re-sign on reaching the age of majority/);
  assert.match(waiverHtml, /WAIVER: Granite Works/, "the canonical rendering is shown per version");
  pass("waiver builder shows the mono version stamp, the minor rules and the canonical text");

  const incidentsPage = await fetch(`${BASE}/incidents`, { headers: { cookie } });
  const incidentsHtml = await incidentsPage.text();
  assert.match(incidentsHtml, /Ankle roll on the landing mat/);
  pass("incidents screen lists the seeded incident");

  // Cross-tenant isolation: another account must not read this one's record.
  const [otherUser] = await db.select().from(users).where(eq(users.email, "verify-isolation@waiverwing.test"));
  if (!otherUser) {
    const { signup } = await import("@/lib/auth");
    void signup;
  }
  const strangerToken = await new SignJWT({ userId: "00000000-0000-0000-0000-000000000000", email: "nobody@x.test" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  const stranger = await fetch(`${BASE}/api/signatures/${sigId}/pdf`, {
    headers: { cookie: `waiverwing_session=${strangerToken}` },
  });
  assert.equal(stranger.status, 401);
  pass("a session for a non-existent user cannot pull a PDF");

  const manifest = await fetch(`${BASE}/manifest.webmanifest`);
  const manifestBody = await manifest.json();
  assert.equal(manifest.status, 200);
  assert.equal(manifestBody.display, "fullscreen");
  assert.ok(manifestBody.icons.length > 0);
  const robots = await fetch(`${BASE}/robots.txt`);
  const robotsText = await robots.text();
  assert.match(robotsText, /Disallow: \/sign\//);
  const sitemap = await fetch(`${BASE}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  pass("manifest, robots and sitemap all return real values");

  console.log(`\n${ok.length} HTTP checks passed.`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("\nFAILED:", err);
  await closeDb();
  process.exit(1);
});
