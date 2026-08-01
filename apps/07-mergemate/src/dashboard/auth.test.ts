/**
 * Dashboard sessions.
 *
 * The dashboard shows every finding MergeMate ever made about a team's private code,
 * so the session cookie is the whole access-control story: it must be forgeable by
 * nobody and must carry the installations the signer was actually entitled to.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { SignJWT } from "jose";
import {
  canSeeInstallation,
  clearCookieHeader,
  cookieHeader,
  parseCookies,
  signSession,
  verifySession,
} from "./auth";

// The secret is read lazily, inside each call, so setting it here is enough.
process.env.AUTH_SECRET = "test-secret-value-for-session-signing-32";

test("a signed session round-trips", async () => {
  const token = await signSession({ login: "dana", installationIds: [42, 43], allInstallations: false });
  const session = await verifySession(token);
  assert.ok(session);
  assert.equal(session.login, "dana");
  assert.deepEqual(session.installationIds, [42, 43]);
  assert.equal(session.allInstallations, false);
});

test("a tampered, truncated, or foreign-signed token is rejected", async () => {
  const token = await signSession({ login: "dana", installationIds: [42], allInstallations: false });
  const [header, payload, signature] = token.split(".");

  assert.equal(await verifySession(undefined), null);
  assert.equal(await verifySession(""), null);
  assert.equal(await verifySession("not-a-jwt"), null);
  assert.equal(await verifySession(`${header}.${payload}.${signature}x`), null);

  // Re-encoding the payload with a different login but the original signature.
  const forged = Buffer.from(JSON.stringify({ login: "attacker", installationIds: [42], all: true })).toString(
    "base64url",
  );
  assert.equal(await verifySession(`${header}.${forged}.${signature}`), null);
});

test("an expired token is rejected", async () => {
  // jose validates `exp`; a token minted in the past is refused rather than trusted.
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const expired = await new SignJWT({ login: "dana", installationIds: [1], all: false })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7_200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3_600)
    .sign(secret);
  assert.equal(await verifySession(expired), null);
});

test("a session may only see the installations it was granted", async () => {
  const scoped = await verifySession(
    await signSession({ login: "dana", installationIds: [42], allInstallations: false }),
  );
  assert.ok(scoped);
  assert.equal(canSeeInstallation(scoped, 42), true);
  assert.equal(canSeeInstallation(scoped, 43), false, "another org's installation is invisible");

  const devLogin = await verifySession(
    await signSession({ login: "local-dev", installationIds: [], allInstallations: true }),
  );
  assert.ok(devLogin);
  assert.equal(canSeeInstallation(devLogin, 999), true);
});

test("cookie handling: httpOnly, SameSite, and a real clear", () => {
  const header = cookieHeader("token-value", true);
  assert.match(header, /^mergemate_session=token-value/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Secure/);
  assert.ok(!cookieHeader("t", false).includes("Secure"), "no Secure flag over plain http locally");
  assert.match(clearCookieHeader(), /Max-Age=0/);

  const parsed = parseCookies("a=1; mergemate_session=abc%20def; b=2");
  assert.equal(parsed["mergemate_session"], "abc def");
  assert.deepEqual(parseCookies(undefined), {});
});
