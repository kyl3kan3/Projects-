/**
 * Crew links. The test that matters is uniqueness: the product promises that
 * resending a link revokes the previous one, and that promise is only kept if two
 * mints never produce the same token.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

// `env` reads through getters at call time, so setting these before the first
// mint is enough — no dynamic import needed.
process.env.CREW_TOKEN_SECRET ??= "test-crew-token-secret-000000000000";
process.env.AUTH_SECRET ??= "test-auth-secret-0000000000000000";

import { hashToken, mintCrewToken, verifyCrewToken } from "./crew-token";

const INSTANCE = "b0c4f2ce-1f2a-4d21-9d0b-1e2f3a4b5c6d";
const CREW = "a1b2c3d4-1111-2222-3333-444455556666";

test("a minted token verifies and names its instance and crew", async () => {
  const { token, tokenHash } = await mintCrewToken(INSTANCE, CREW);
  const result = await verifyCrewToken(token);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.ti, INSTANCE);
  assert.equal(result.payload.cr, CREW);
  assert.equal(result.tokenHash, tokenHash);
  assert.equal(hashToken(token), tokenHash);
});

test("two mints in the same second are different tokens", async () => {
  // Without a nonce these are byte-identical (iat has one-second resolution),
  // and "resend revokes the old link" silently stops working.
  const a = await mintCrewToken(INSTANCE, CREW);
  const b = await mintCrewToken(INSTANCE, CREW);
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.tokenHash, b.tokenHash);
});

test("a tampered token does not verify", async () => {
  const { token } = await mintCrewToken(INSTANCE, CREW);
  const parts = token.split(".");
  const forged = `${parts[0]}.${Buffer.from(
    JSON.stringify({ ti: INSTANCE, cr: "00000000-0000-0000-0000-000000000000" }),
  ).toString("base64url")}.${parts[2]}`;
  const result = await verifyCrewToken(forged);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
});

test("garbage and empty strings are rejected, not thrown on", async () => {
  for (const bad of ["", "abc", "a.b.c", "eyJhbGciOiJIUzI1NiJ9.e30.x"]) {
    const result = await verifyCrewToken(bad);
    assert.equal(result.ok, false);
  }
});
