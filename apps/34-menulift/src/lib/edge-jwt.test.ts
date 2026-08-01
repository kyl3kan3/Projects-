import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { verifyHs256 } from "./edge-jwt";

const SECRET = "a-test-secret-that-is-long-enough-for-hs256";
const key = new TextEncoder().encode(SECRET);

async function sign(payload: Record<string, unknown>, expiry = "30m"): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(key);
}

test("accepts a token jose signed, and returns its claims", async () => {
  const token = await sign({ kind: "user", userId: "u1", email: "dana@rossiandco.com" });
  const claims = await verifyHs256(token, SECRET);
  assert.equal(claims?.kind, "user");
  assert.equal(claims?.userId, "u1");
});

test("rejects a token signed with a different secret", async () => {
  const token = await sign({ kind: "user" });
  assert.equal(await verifyHs256(token, `${SECRET}-wrong`), null);
});

test("rejects a tampered payload", async () => {
  const token = await sign({ kind: "board", locationId: "l1", actorLabel: "Dana" });
  const [header, , signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ kind: "user", userId: "attacker" }))
    .toString("base64url")
    .replace(/=+$/, "");
  assert.equal(await verifyHs256(`${header}.${forged}.${signature}`, SECRET), null);
});

test("rejects alg:none, the classic forgery", async () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ kind: "user", userId: "attacker" })).toString(
    "base64url",
  );
  assert.equal(await verifyHs256(`${header}.${payload}.`, SECRET), null);
});

test("rejects an expired token", async () => {
  const token = await new SignJWT({ kind: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(key);
  assert.equal(await verifyHs256(token, SECRET), null);
});

test("rejects garbage without throwing", async () => {
  for (const bad of ["", "not-a-token", "a.b", "a.b.c.d", "...", "%%%.%%%.%%%"]) {
    assert.equal(await verifyHs256(bad, SECRET), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("a board token is distinguishable from a user token", async () => {
  const board = await sign({ kind: "board", locationId: "l1", actorLabel: "Dana" });
  const claims = await verifyHs256(board, SECRET);
  assert.equal(claims?.kind, "board", "middleware checks this to keep PIN sessions off the dashboard");
});
