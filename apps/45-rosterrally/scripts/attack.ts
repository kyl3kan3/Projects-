/**
 * Attack pass: prove that no parent-facing surface leaks another family's data,
 * and that no console surface leaks across clubs or roles.
 * Throwaway — deleted before the tree is handed over.
 */

import { loadEnvLocal } from "../src/lib/load-env";
loadEnvLocal();

import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import {
  clubs,
  households,
  players,
  registrations,
  rosterSpots,
  seasons,
  teams,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { mintHouseholdToken, mintTeamFeedToken } from "../src/lib/links";
import { decryptContacts, decryptField } from "../src/lib/crypto";

const BASE = process.env.BASE ?? "http://localhost:3045";

let pass = 0;
let fail = 0;

function check(ok: boolean, what: string, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${what}`);
  } else {
    fail += 1;
    console.log(`! FAIL  ${what}${detail ? ` — ${detail}` : ""}`);
  }
}

async function body(url: string, init?: RequestInit): Promise<{ status: number; text: string; url: string }> {
  const res = await fetch(url, { redirect: "manual", ...init });
  return { status: res.status, text: await res.text(), url: res.headers.get("location") ?? url };
}

async function main() {
  const db = getDb();

  const [club] = await db.select().from(clubs).where(eq(clubs.name, "Millbrook Youth Soccer"));
  const [otherClub] = await db.select().from(clubs).where(eq(clubs.name, "Riverside Rangers"));
  if (!club || !otherClub) throw new Error("run scripts/dev-seed.ts --reset first");

  const allHouseholds = await db.select().from(households).where(eq(households.clubId, club.id));
  const allPlayers = await db.select().from(players);
  const [season] = await db.select().from(seasons).where(eq(seasons.clubId, club.id));

  const alvarez = allHouseholds.find((h) => h.email === "elena.alvarez@example.com")!;
  const brennan = allHouseholds.find((h) => h.email === "sean.brennan@example.com")!;
  const nguyen = allHouseholds.find((h) => h.email === "thu.nguyen@example.com")!;

  const alvarezToken = await mintHouseholdToken(alvarez.id);
  const nguyenToken = await mintHouseholdToken(nguyen.id);

  // Everything that must never appear on somebody else's page.
  const otherSecrets: [string, string][] = [];
  for (const h of allHouseholds) {
    if (h.id === alvarez.id) continue;
    otherSecrets.push([`${h.contactName}'s email`, h.email]);
    if (h.phone) otherSecrets.push([`${h.contactName}'s phone`, h.phone]);
  }
  // Read the real stored values back, rather than trusting strings I typed: an
  // assertion that accidentally matches a UI placeholder proves nothing.
  const alvarezPlayerIds = new Set(
    allPlayers.filter((p) => p.householdId === alvarez.id).map((p) => p.id),
  );
  const foreignNotes: string[] = [];
  for (const p of allPlayers) {
    if (alvarezPlayerIds.has(p.id)) continue;
    const note = decryptField(p.medicalNotesEnc);
    if (note) {
      foreignNotes.push(note);
      otherSecrets.push([`${p.firstName}'s medical note`, note]);
    }
    for (const c of decryptContacts(p.emergencyContactsEnc)) {
      otherSecrets.push([`${p.firstName}'s emergency contact`, c.name]);
      otherSecrets.push([`${p.firstName}'s emergency number`, c.phone]);
    }
    otherSecrets.push([`${p.firstName}'s full name`, `${p.firstName} ${p.lastName}`]);
  }
  const ownNote = decryptField(
    allPlayers.find((p) => p.firstName === "Mateo")!.medicalNotesEnc,
  )!;
  console.log(`  (checking ${otherSecrets.length} other-family values, ${foreignNotes.length} foreign medical notes)`);

  console.log("\n=== 1. A family's own page shows only that family ===");
  const own = await body(`${BASE}/p/${alvarezToken}`);
  check(own.status === 200, "the Alvarez link opens their page", `status ${own.status}`);
  check(own.text.includes("Elena Alvarez"), "their own name is present");
  check(own.text.includes(ownNote), "their own child's note is visible to them");
  for (const [label, secret] of otherSecrets) {
    check(!own.text.includes(secret), `no ${label} on the Alvarez page`);
  }
  // Teammates appear as a first name and last initial, never a full identity.
  // Work out who is actually on a team with an Alvarez child right now, rather
  // than assuming: the seed cancels one registration, which takes that child off
  // the team sheet.
  const spots = await db
    .select({ teamId: rosterSpots.teamId, playerId: rosterSpots.playerId })
    .from(rosterSpots);
  const alvarezTeamIds = new Set(
    spots.filter((s) => alvarezPlayerIds.has(s.playerId)).map((s) => s.teamId),
  );
  const teammates = spots
    .filter((s) => alvarezTeamIds.has(s.teamId) && !alvarezPlayerIds.has(s.playerId))
    .map((s) => allPlayers.find((p) => p.id === s.playerId)!)
    .filter(Boolean);
  if (teammates.length === 0) {
    console.log("  ....  no teammates from other families are rostered, so nothing to check");
  }
  for (const mate of teammates) {
    const short = `${mate.firstName} ${mate.lastName.slice(0, 1)}.`;
    check(own.text.includes(short), `teammate ${mate.firstName} shows as "${short}"`);
    check(
      !own.text.includes(`${mate.firstName} ${mate.lastName}`),
      `teammate ${mate.firstName}'s full name is not shown`,
    );
  }

  console.log("\n=== 2. A token only ever opens its own family ===");
  const swapped = await body(`${BASE}/p/${nguyenToken}`);
  check(swapped.text.includes("Thu Nguyen"), "the Nguyen link opens the Nguyen page");
  check(!swapped.text.includes("elena.alvarez@example.com"), "and shows no Alvarez contact detail");
  check(!swapped.text.includes(ownNote), "and no Alvarez medical note");

  console.log("\n=== 3. Forged and mangled tokens open nothing ===");
  const secretKey = new TextEncoder().encode(process.env.LINK_TOKEN_SECRET!);
  const forgeries: [string, string][] = [
    ["a truncated token", alvarezToken.slice(0, -6)],
    ["a token with a flipped signature byte", `${alvarezToken.slice(0, -4)}AAAA`],
    ["a raw household uuid", alvarez.id],
    ["a registration uuid", (await db.select().from(registrations).limit(1))[0].id],
    ["the word admin", "admin"],
    ["an empty segment", "..."],
    [
      "an alg=none forgery",
      `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(
        JSON.stringify({ householdId: brennan.id, clubId: club.id, kind: "household", jti: "x" }),
      ).toString("base64url")}.`,
    ],
    [
      "a token signed with the wrong secret",
      await new SignJWT({ householdId: brennan.id, clubId: club.id, kind: "household" })
        .setProtectedHeader({ alg: "HS256" })
        .setJti("guessed")
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("not-the-real-secret")),
    ],
    [
      "a validly signed token with a guessed jti",
      await new SignJWT({ householdId: brennan.id, clubId: club.id, kind: "household" })
        .setProtectedHeader({ alg: "HS256" })
        .setJti("00000000000000000000000000000000")
        .setExpirationTime("1h")
        .sign(secretKey),
    ],
    [
      "a validly signed token with the wrong club",
      await new SignJWT({ householdId: brennan.id, clubId: otherClub.id, kind: "household" })
        .setProtectedHeader({ alg: "HS256" })
        .setJti(brennan.linkTokenId ?? "x")
        .setExpirationTime("1h")
        .sign(secretKey),
    ],
    [
      "an expired but otherwise valid token",
      await new SignJWT({ householdId: brennan.id, clubId: club.id, kind: "household" })
        .setProtectedHeader({ alg: "HS256" })
        .setJti(brennan.linkTokenId ?? "x")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7_200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3_600)
        .sign(secretKey),
    ],
    [
      "a team-feed token used as a family link",
      await mintTeamFeedToken((await db.select().from(teams).limit(1))[0].id),
    ],
  ];
  for (const [label, token] of forgeries) {
    const res = await body(`${BASE}/p/${encodeURIComponent(token)}`);
    const leaked =
      res.text.includes("sean.brennan@example.com") ||
      foreignNotes.some((n) => res.text.includes(n)) ||
      res.text.includes("Maeve Brennan");
    const refused = res.text.includes("not valid") || res.text.includes("has expired") || res.status >= 400;
    check(!leaked && refused, `${label} is refused`, `status ${res.status}`);
  }

  console.log("\n=== 4. A revoked link stays dead ===");
  const revocable = await mintHouseholdToken(brennan.id);
  check((await body(`${BASE}/p/${revocable}`)).text.includes("Sean Brennan"), "the fresh link works");
  await db.update(households).set({ linkTokenId: null }).where(eq(households.id, brennan.id));
  const afterRevoke = await body(`${BASE}/p/${revocable}`);
  check(
    !afterRevoke.text.includes("sean.brennan@example.com") &&
      foreignNotes.every((n) => !afterRevoke.text.includes(n)),
    "the same link leaks nothing once revoked",
  );
  await mintHouseholdToken(brennan.id);

  console.log("\n=== 5. The calendar feed carries a schedule and nothing else ===");
  const feedToken = await mintTeamFeedToken((await db.select().from(teams).where(eq(teams.name, "Thunder")))[0].id);
  const feed = await body(`${BASE}/api/ical/${feedToken}`);
  check(feed.status === 200 && feed.text.includes("BEGIN:VCALENDAR"), "the feed serves a calendar");
  const namesInFeed = allPlayers.filter((p) => feed.text.includes(`${p.firstName} ${p.lastName}`));
  check(namesInFeed.length === 0, "no child's name is in the feed", namesInFeed.map((p) => p.firstName).join(","));
  const contactsInFeed = allHouseholds.filter((h) => feed.text.includes(h.email));
  check(contactsInFeed.length === 0, "no parent's email is in the feed");
  check(foreignNotes.every((n) => !feed.text.includes(n)) && !feed.text.includes(ownNote), "no medical note is in the feed");
  check(
    (await body(`${BASE}/api/ical/${alvarezToken}`)).status === 404,
    "a family link cannot be used as a calendar feed",
  );
  check((await body(`${BASE}/api/ical/nonsense`)).status === 404, "a nonsense feed token 404s");

  console.log("\n=== 6. The public registration page exposes no existing family ===");
  const register = await body(`${BASE}/register/${season.slug}`);
  check(register.status === 200, "the registration page loads");
  const leakedOnRegister = allHouseholds.filter((h) => register.text.includes(h.email));
  check(leakedOnRegister.length === 0, "no registered family's email appears on it");
  const kidsOnRegister = allPlayers.filter((p) => register.text.includes(`${p.firstName} ${p.lastName}`));
  check(kidsOnRegister.length === 0, "no registered child's name appears on it");
  const notesOnRegister = foreignNotes.filter((n) => register.text.includes(n));
  check(notesOnRegister.length === 0, "no stored medical note appears on it", notesOnRegister.join(" | "));

  console.log("\n=== 7. The console is closed without a session ===");
  for (const path of [
    "/season",
    "/season/setup",
    "/registrations",
    `/registrations/${(await db.select().from(registrations).limit(1))[0].id}`,
    "/rosters",
    "/schedule",
    "/comms",
    "/volunteers",
    "/settings",
  ]) {
    const res = await body(`${BASE}${path}`);
    const redirected = res.status === 307 || res.status === 302;
    check(redirected && res.url.includes("/login"), `${path} redirects to the login screen`, `status ${res.status}`);
  }
  for (const path of [`/registrations/export?season=${season.id}`, `/rosters/export?team=${(await db.select().from(teams).limit(1))[0].id}`]) {
    const res = await body(`${BASE}${path}`);
    const denied =
      res.status === 401 || ((res.status === 307 || res.status === 302) && res.url.includes("/login"));
    check(denied, `${path} is closed without a session`, `status ${res.status} -> ${res.url}`);
    check(!/Ventolin|Anaphylaxis|@example\.com/.test(res.text), `${path} returns no data`);
  }

  console.log("\n=== 8. The cron endpoint refuses without its secret ===");
  check((await body(`${BASE}/api/cron/tick`)).status === 401, "no bearer token is rejected");
  check(
    (await body(`${BASE}/api/cron/tick`, { headers: { authorization: "Bearer wrong" } })).status === 401,
    "a wrong bearer token is rejected",
  );

  console.log("\n=== 9. The Stripe webhook refuses unsigned payloads ===");
  const hook = await body(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    body: JSON.stringify({ type: "checkout.session.completed", id: "evt_forged" }),
  });
  check(hook.status >= 400, "an unsigned webhook is refused", `status ${hook.status}`);

  console.log("\n=== 10. Tracking endpoints leak nothing and never break a message ===");
  const pixel = await body(`${BASE}/api/t/o/00000000-0000-0000-0000-000000000000`);
  check(pixel.status === 200, "an unknown pixel id still returns an image");
  const click = await body(`${BASE}/api/t/c/00000000-0000-0000-0000-000000000000?to=https://evil.example.com/`);
  check(
    click.status === 302 && !(click.url ?? "").includes("evil.example.com"),
    "the tracked link refuses to redirect off-site",
    click.url,
  );

  console.log("\n=== 11. Cross-club and coach-scoped console access ===");
  // A staff account in the other club must not see this club's rows.
  const password = "attack-probe-pw";
  const [intruder] = await db
    .insert(users)
    .values({
      clubId: otherClub.id,
      email: "intruder@rangers.example.com",
      name: "Other Club Admin",
      role: "admin",
      passwordHash: await hashPassword(password),
    })
    .onConflictDoNothing()
    .returning();
  const intruderEmail = intruder?.email ?? "intruder@rangers.example.com";

  async function sessionFor(email: string, pw: string): Promise<string> {
    const res = await fetch(`${BASE}/login`, { method: "GET" });
    void (await res.text());
    // Log in through the domain function's own hashing by posting the form is not
    // possible without an encrypted action payload, so mint the same cookie the
    // app would: sign a session JWT with AUTH_SECRET, exactly as lib/auth does.
    const [user] = await db.select().from(users).where(eq(users.email, email));
    void pw;
    const token = await new SignJWT({ userId: user.id, email: user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    return `rosterrally_session=${token}`;
  }

  const intruderCookie = await sessionFor(intruderEmail, password);
  const targetRegistration = (
    await db.select().from(registrations).where(eq(registrations.clubId, club.id)).limit(1)
  )[0];
  const crossReg = await body(`${BASE}/registrations/${targetRegistration.id}`, {
    headers: { cookie: intruderCookie },
  });
  check(
    crossReg.status === 404 ||
      (!crossReg.text.includes(ownNote) && !crossReg.text.includes("elena.alvarez@example.com")),
    "another club's admin cannot open this club's registration",
    `status ${crossReg.status}`,
  );
  const crossExport = await body(`${BASE}/registrations/export?season=${season.id}`, {
    headers: { cookie: intruderCookie },
  });
  check(crossExport.status === 404, "another club's admin cannot export this season", `status ${crossExport.status}`);
  const crossRoster = await body(
    `${BASE}/rosters/export?team=${(await db.select().from(teams).where(eq(teams.clubId, club.id)).limit(1))[0].id}`,
    { headers: { cookie: intruderCookie } },
  );
  check(crossRoster.status === 404, "another club's admin cannot export this club's roster", `status ${crossRoster.status}`);

  // A coach in this club sees names and numbers, never medical or contacts.
  const coachCookie = await sessionFor("marcus@millbrooksoccer.org", "fall2026season");
  const coachRosters = await body(`${BASE}/rosters`, { headers: { cookie: coachCookie } });
  check(coachRosters.status === 200, "a coach can open the roster screen");
  check(
    foreignNotes.every((n) => !coachRosters.text.includes(n)) && !coachRosters.text.includes(ownNote),
    "a coach's roster screen holds no medical note",
  );
  check(!coachRosters.text.includes("elena.alvarez@example.com"), "a coach's roster screen holds no parent email");
  const coachReg = await body(`${BASE}/registrations/${targetRegistration.id}`, {
    headers: { cookie: coachCookie },
  });
  check(
    foreignNotes.every((n) => !coachReg.text.includes(n)) && !coachReg.text.includes(ownNote),
    "a coach opening a registration sees no medical note",
    `status ${coachReg.status}`,
  );
  const otherTeam = (await db.select().from(teams).where(eq(teams.name, "Rapids")))[0];
  const coachOtherRoster = await body(`${BASE}/rosters/export?team=${otherTeam.id}`, {
    headers: { cookie: coachCookie },
  });
  check(coachOtherRoster.status === 403, "a coach cannot export a team that is not theirs", `status ${coachOtherRoster.status}`);

  // The coach's own roster CSV is names and numbers only.
  const ownTeam = (await db.select().from(teams).where(eq(teams.name, "Thunder")))[0];
  const ownCsv = await body(`${BASE}/rosters/export?team=${ownTeam.id}`, {
    headers: { cookie: coachCookie },
  });
  check(ownCsv.status === 200, "a coach can export their own team");
  check(
    foreignNotes.every((n) => !ownCsv.text.includes(n)) &&
      !ownCsv.text.includes(ownNote) &&
      !/@example\.com|\+1555/.test(ownCsv.text),
    "the sideline CSV holds no medical note, email or phone number",
  );

  console.log("\n=== 12. The registrar CSV excludes medical notes ===");
  const registrarCookie = await sessionFor("dana@millbrooksoccer.org", "fall2026season");
  const registrarCsv = await body(`${BASE}/registrations/export?season=${season.id}`, {
    headers: { cookie: registrarCookie },
  });
  check(registrarCsv.status === 200, "the registrar can export");
  check(
    foreignNotes.every((n) => !registrarCsv.text.includes(n)) && !registrarCsv.text.includes(ownNote),
    "no medical note is in the export",
  );
  check(registrarCsv.text.includes("elena.alvarez@example.com"), "parent contact IS present, as a registrar needs");

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  if (fail > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
