import test from "node:test";
import assert from "node:assert/strict";
import { StatementSplitter, isExecutable, splitStatements } from "@/lib/sqlsplit";

test("splits ordinary statements", () => {
  assert.deepEqual(splitStatements("SELECT 1; SELECT 2;"), ["SELECT 1", "SELECT 2"]);
  // A trailing statement without a semicolon is still a statement.
  assert.deepEqual(splitStatements("SELECT 1;\nSELECT 2"), ["SELECT 1", "SELECT 2"]);
  assert.deepEqual(splitStatements("   \n  "), []);
});

test("a semicolon inside a string literal is not a terminator", () => {
  const sql = "INSERT INTO t VALUES ('a;b', 'c');SELECT 1;";
  assert.deepEqual(splitStatements(sql), ["INSERT INTO t VALUES ('a;b', 'c')", "SELECT 1"]);
});

test("doubled quotes inside literals and identifiers are handled", () => {
  assert.deepEqual(splitStatements("INSERT INTO t VALUES ('it''s; fine');"), [
    "INSERT INTO t VALUES ('it''s; fine')",
  ]);
  assert.deepEqual(splitStatements(`SELECT "we;ird""col" FROM t;`), [
    `SELECT "we;ird""col" FROM t`,
  ]);
});

test("E'' strings treat backslash as an escape", () => {
  // Without escape handling, the \' would look like the end of the literal and
  // the ; inside it would split the statement in half.
  const sql = "INSERT INTO t VALUES (E'a\\';b');SELECT 1;";
  assert.deepEqual(splitStatements(sql), ["INSERT INTO t VALUES (E'a\\';b')", "SELECT 1"]);
});

test("dollar-quoted function bodies survive intact", () => {
  const sql = [
    "CREATE FUNCTION f() RETURNS trigger AS $$",
    "BEGIN",
    "  UPDATE t SET x = 1; -- a semicolon, inside a body",
    "  RETURN NEW;",
    "END;",
    "$$ LANGUAGE plpgsql;",
    "SELECT 1;",
  ].join("\n");
  const out = splitStatements(sql);
  assert.equal(out.length, 2);
  assert.ok(out[0].startsWith("CREATE FUNCTION"));
  assert.ok(out[0].includes("RETURN NEW;"));
  assert.equal(out[1], "SELECT 1");
});

test("tagged dollar quotes only close on their own tag", () => {
  const sql = "CREATE FUNCTION f() RETURNS int AS $body$ SELECT $$inner; text$$ ; $body$;SELECT 2;";
  const out = splitStatements(sql);
  assert.equal(out.length, 2);
  assert.ok(out[0].includes("$$inner; text$$"));
  assert.equal(out[1], "SELECT 2");
});

test("comments cannot terminate or hide a statement", () => {
  const sql = "-- a comment; with a semicolon\nSELECT 1;\n/* block; comment */ SELECT 2;";
  const out = splitStatements(sql);
  assert.equal(out.length, 2);
  assert.ok(out[0].endsWith("SELECT 1"));
  assert.ok(out[1].endsWith("SELECT 2"));
});

test("psql meta-commands are their own statements", () => {
  // Regression: pg_dump wraps its output in \restrict / \unrestrict, which carry
  // no semicolon. Gluing them onto the next statement broke every restore with
  // `syntax error at or near "\"`.
  const sql = [
    "\\restrict AbC123token",
    "SET statement_timeout = 0;",
    "CREATE TABLE t (id int);",
    "\\unrestrict AbC123token",
  ].join("\n");
  const out = splitStatements(sql);
  const executable = out.filter(isExecutable);
  assert.deepEqual(executable, ["SET statement_timeout = 0", "CREATE TABLE t (id int)"]);
});

test("a backslash mid-statement is not mistaken for a meta-command", () => {
  const sql = "INSERT INTO t VALUES ('\\x89504e47'::bytea);";
  assert.deepEqual(splitStatements(sql), ["INSERT INTO t VALUES ('\\x89504e47'::bytea)"]);
});

test("streaming in arbitrary chunks gives the same answer as one string", () => {
  const sql = [
    "\\restrict tok",
    "SET a = 'x;y';",
    "CREATE FUNCTION f() RETURNS int AS $b$ SELECT 1; $b$ LANGUAGE sql;",
    "INSERT INTO t VALUES ('it''s', E'a\\';b', '{\"k\":\"v;\"}'::jsonb);",
    "-- trailing; comment",
    "SELECT 42;",
  ].join("\n");
  const whole = splitStatements(sql);

  for (const size of [1, 2, 3, 5, 7, 13, 64]) {
    const splitter = new StatementSplitter();
    const chunked: string[] = [];
    for (let i = 0; i < sql.length; i += size) {
      chunked.push(...splitter.push(sql.slice(i, i + size)));
    }
    chunked.push(...splitter.end());
    assert.deepEqual(chunked, whole, `chunk size ${size} disagreed with the whole-string split`);
  }
});

test("an unterminated literal at end of stream is an error, not a silent truncation", () => {
  const splitter = new StatementSplitter();
  splitter.push("INSERT INTO t VALUES ('unclosed");
  assert.throws(() => splitter.end(), /unterminated/);
});

test("isExecutable drops meta-commands and comment-only statements", () => {
  assert.equal(isExecutable("SELECT 1"), true);
  assert.equal(isExecutable("\\restrict tok"), false);
  assert.equal(isExecutable("-- just a comment"), false);
  assert.equal(isExecutable("/* only a block comment */"), false);
  assert.equal(isExecutable("   "), false);
  assert.equal(isExecutable("-- leading comment\nSELECT 1"), true);
});
