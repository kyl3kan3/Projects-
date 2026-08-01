import test from "node:test";
import assert from "node:assert/strict";
import {
  ConnectionStringError,
  detectPooled,
  detectProvider,
  fingerprint,
  maskConnectionString,
  normalizeForDump,
  parseConnectionString,
  requiresTls,
} from "@/lib/providers";

test("parses a provider connection string", () => {
  const parsed = parseConnectionString(
    "postgresql://postgres.abcdefgh:s3cr%40t@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require",
  );
  assert.equal(parsed.host, "aws-0-eu-west-2.pooler.supabase.com");
  assert.equal(parsed.port, 6543);
  assert.equal(parsed.database, "postgres");
  assert.equal(parsed.user, "postgres.abcdefgh");
  // Percent-encoded characters in the password must survive.
  assert.equal(parsed.password, "s3cr@t");
  assert.equal(parsed.sslMode, "require");
});

test("defaults the port to 5432", () => {
  assert.equal(parseConnectionString("postgres://u:p@db.example.com/app").port, 5432);
});

test("rejects the near-misses customers actually paste", () => {
  assert.throws(() => parseConnectionString(""), ConnectionStringError);
  assert.throws(
    () => parseConnectionString("jdbc:postgresql://db.example.com:5432/app"),
    /JDBC/,
  );
  assert.throws(
    () => parseConnectionString("psql -h db.example.com -U postgres app"),
    /psql command/,
  );
  assert.throws(() => parseConnectionString("mysql://u:p@host/db"), /must start with postgres/);
  assert.throws(
    () =>
      parseConnectionString(
        "postgresql://postgres:[YOUR-PASSWORD]@db.abcdefgh.supabase.co:5432/postgres",
      ),
    /placeholder is still in there/,
  );
  assert.throws(() => parseConnectionString("postgres://u:p@host"), /no database name/);
  assert.throws(() => parseConnectionString("postgres://host/db"), /no username/);
});

test("detects the providers in scope from the hostname", () => {
  assert.equal(detectProvider("db.abcdefgh.supabase.co"), "supabase");
  assert.equal(detectProvider("aws-0-eu-west-2.pooler.supabase.com"), "supabase");
  assert.equal(detectProvider("ep-cool-name-123456.eu-central-1.aws.neon.tech"), "neon");
  assert.equal(detectProvider("aws.connect.psdb.cloud"), "planetscale");
  assert.equal(detectProvider("containers-us-west-42.railway.app"), "railway");
  assert.equal(detectProvider("monorail.proxy.rlwy.net"), "railway");
  assert.equal(detectProvider("db.acme.internal"), "generic");
  // Not a real Supabase host — the suffix has to match, not appear anywhere.
  assert.equal(detectProvider("supabase.co.evil.example.com"), "generic");
});

test("pooler detection covers the shapes that break pg_dump", () => {
  assert.equal(detectPooled("aws-0-eu-west-2.pooler.supabase.com", 6543), true);
  assert.equal(detectPooled("aws-0-eu-west-2.pooler.supabase.com", 5432), true);
  assert.equal(detectPooled("ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech", 5432), true);
  assert.equal(detectPooled("db.acme.com", 6543), true);
  assert.equal(detectPooled("pgbouncer.acme.com", 5432), true);
  assert.equal(detectPooled("db.abcdefgh.supabase.co", 5432), false);
  assert.equal(detectPooled("ep-cool-name-123456.eu-central-1.aws.neon.tech", 5432), false);
});

test("TLS is required everywhere except loopback and private ranges", () => {
  assert.equal(requiresTls("db.abcdefgh.supabase.co"), true);
  assert.equal(requiresTls("localhost"), false);
  assert.equal(requiresTls("127.0.0.1"), false);
  assert.equal(requiresTls("10.1.2.3"), false);
  assert.equal(requiresTls("192.168.0.9"), false);
  assert.equal(requiresTls("172.20.1.1"), false);
  assert.equal(requiresTls("172.15.1.1"), true, "172.15 is public space");
  assert.equal(requiresTls("db.acme.local"), false);
});

test("fingerprints identify a database without exposing credentials", () => {
  const parsed = parseConnectionString("postgres://u:supersecret@db.abcdefgh.supabase.co/postgres");
  const printed = fingerprint(parsed);
  assert.equal(printed, "db.abcdefgh.supabase.co:5432/postgres");
  assert.ok(!printed.includes("supersecret"));
});

test("masking keeps the shape and drops the secret", () => {
  const masked = maskConnectionString("postgres://postgres:hunter2@db.abcdefgh.supabase.co:5432/postgres");
  assert.ok(!masked.includes("hunter2"));
  assert.ok(masked.includes("db.abcdefgh.supabase.co"));
  assert.ok(masked.startsWith("postgres://postgres:"));
  // Garbage in still does not leak anything.
  assert.equal(maskConnectionString("nonsense"), "postgres://•••••••");
});

test("normalizeForDump forces TLS where TLS is required, and leaves choices alone", () => {
  assert.ok(
    normalizeForDump("postgres://u:p@db.abcdefgh.supabase.co/postgres").includes("sslmode=require"),
  );
  assert.equal(
    normalizeForDump("postgres://u:p@db.abcdefgh.supabase.co/postgres?sslmode=verify-full").includes(
      "sslmode=require",
    ),
    false,
  );
  assert.equal(
    normalizeForDump("postgres://postgres@localhost:5433/app").includes("sslmode"),
    false,
  );
});
