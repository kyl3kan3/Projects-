/**
 * The dump engine: turn a customer database into a stream of SQL text.
 *
 * Two engines produce the same thing, and the same restore path reads both:
 *
 *   `pg_dump`         — spawned with `--format=plain --inserts`, streamed from
 *                       its stdout. Used whenever the binary exists and is at
 *                       least as new as the server.
 *   `vaultback-sql`   — a pure-TypeScript logical dumper reading the catalogs
 *                       directly. Used when pg_dump is absent (serverless hosts
 *                       have no Postgres client binaries) or too old for the
 *                       server (ARCHITECTURE.md risk 2: version skew is a real
 *                       silent-failure mode).
 *
 * **Deviation from ARCHITECTURE.md, on purpose.** That document specifies
 * `pg_dump --format=custom`. Custom format is a binary archive only `pg_restore`
 * can read, which would mean (a) a required binary on the restore path, which
 * Vercel does not have, and (b) VaultBack itself unable to verify a restore
 * without shelling out. Plain SQL keeps the product's promise checkable in
 * process and keeps the archive readable by anything — which is also what makes
 * "you can leave whenever you like" true. Cost: no `pg_restore --list`, no
 * parallel restore, larger uncompressed dumps (gzip absorbs most of that).
 *
 * Nothing here spools to disk. The output is a stream from the first byte.
 */

import { spawn } from "node:child_process";
import { PassThrough, Readable } from "node:stream";
import type { TableManifest } from "@/db/schema";
import { parseConnectionString } from "@/lib/providers";
import {
  EXCLUDED_SCHEMAS,
  connectSource,
  inspectDatabase,
  quoteIdent,
  schemaFilterSql,
  type Inspection,
  type SourceClient,
} from "@/lib/source-db";

export type DumpEngine = "pg_dump" | "vaultback-sql";

export interface DumpHandle {
  engine: DumpEngine;
  pgDumpVersion: string | null;
  manifest: TableManifest;
  inspection: Inspection;
  /** Plain SQL text. Consume it fully, then await `finished`. */
  stream: Readable;
  /** Rejects if the dump failed after the stream opened. */
  finished: Promise<void>;
  close(): Promise<void>;
}

export class DumpError extends Error {}

/* ------------------------------------------------------- engine selection --- */

let _pgDumpProbe: Promise<{ full: string; major: number } | null> | null = null;

/** Ask the local pg_dump for its version. Cached: it cannot change at runtime. */
export function probePgDump(): Promise<{ full: string; major: number } | null> {
  if (!_pgDumpProbe) {
    _pgDumpProbe = new Promise((resolve) => {
      const bin = process.env.PG_DUMP_PATH || "pg_dump";
      let out = "";
      let child;
      try {
        child = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return resolve(null);
      }
      child.stdout.on("data", (d) => {
        out += String(d);
      });
      child.on("error", () => resolve(null));
      child.on("close", (code) => {
        if (code !== 0) return resolve(null);
        const m = /(\d+)(?:\.(\d+))?/.exec(out);
        if (!m) return resolve(null);
        resolve({ full: out.trim(), major: Number(m[1]) });
      });
    });
  }
  return _pgDumpProbe;
}

/**
 * Which engine should run against a server of this major version?
 * pg_dump refuses to dump from a server newer than itself, and a customer
 * upgrading their provider's Postgres must not silently stop having backups.
 */
export function chooseEngine(
  serverMajor: number,
  pgDump: { major: number } | null,
  override = process.env.VAULTBACK_DUMP_ENGINE,
): { engine: DumpEngine; reason: string } {
  if (override === "js" || override === "vaultback-sql") {
    return { engine: "vaultback-sql", reason: "forced by VAULTBACK_DUMP_ENGINE" };
  }
  if (override === "pg_dump") {
    return { engine: "pg_dump", reason: "forced by VAULTBACK_DUMP_ENGINE" };
  }
  if (!pgDump) {
    return { engine: "vaultback-sql", reason: "pg_dump is not available on this host" };
  }
  if (serverMajor > pgDump.major) {
    return {
      engine: "vaultback-sql",
      reason: `pg_dump ${pgDump.major} is older than the server (${serverMajor})`,
    };
  }
  return { engine: "pg_dump", reason: `pg_dump ${pgDump.major}` };
}

/* ---------------------------------------------------------------- opening --- */

export async function openDump(connectionString: string): Promise<DumpHandle> {
  // One connection, deliberately: the vaultback-sql engine sets `search_path`
  // on its session so the catalog renders fully-qualified names, and a pool
  // could hand a later query a connection that never saw that setting.
  const sql = connectSource(connectionString, { statementTimeoutMs: 0, max: 1 });
  let inspection: Inspection;
  try {
    inspection = await inspectDatabase(sql, { exactCounts: true });
  } catch (err) {
    await sql.end({ timeout: 5 }).catch(() => {});
    throw new DumpError(
      `Could not read the source database: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const manifest: TableManifest = {
    tables: inspection.tables.map((t) => ({ table: `${t.schema}.${t.table}`, rows: t.rows })),
    totalRows: inspection.totalRows,
    postgresVersion: inspection.postgresVersion,
    dumpedAt: new Date().toISOString(),
  };

  const pgDump = await probePgDump();
  const { engine, reason } = chooseEngine(inspection.serverMajor, pgDump);
  console.info(`[dump] engine=${engine} (${reason})`);

  const header = dumpHeader(manifest, engine);

  if (engine === "pg_dump") {
    // The catalog connection is not needed once pg_dump takes over.
    await sql.end({ timeout: 5 }).catch(() => {});
    const { stream, finished } = spawnPgDump(connectionString, header);
    return {
      engine,
      pgDumpVersion: pgDump?.full ?? null,
      manifest,
      inspection,
      stream,
      finished,
      close: async () => {},
    };
  }

  const stream = Readable.from(generateSqlDump(sql, header), {
    objectMode: false,
    encoding: undefined,
  });
  return {
    engine,
    pgDumpVersion: null,
    manifest,
    inspection,
    stream,
    finished: Promise.resolve(),
    close: async () => {
      await sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}

function dumpHeader(manifest: TableManifest, engine: DumpEngine): string {
  return [
    "-- VaultBack snapshot — plain SQL, gzipped, then AES-256-GCM encrypted.",
    `-- engine: ${engine}`,
    `-- source: ${manifest.postgresVersion}`,
    `-- taken: ${manifest.dumpedAt}`,
    `-- tables: ${manifest.tables.length}  rows: ${manifest.totalRows}`,
    "-- To restore by hand: decrypt with your data key, gunzip, then psql -f.",
    `-- vaultback-manifest: ${JSON.stringify(manifest)}`,
    "",
  ].join("\n");
}

/* ------------------------------------------------------------- pg_dump ----- */

function spawnPgDump(
  connectionString: string,
  header: string,
): { stream: Readable; finished: Promise<void> } {
  const parsed = parseConnectionString(connectionString);
  const out = new PassThrough();
  out.write(header);

  const args = [
    "--host",
    parsed.host,
    "--port",
    String(parsed.port),
    "--username",
    parsed.user,
    "--dbname",
    parsed.database,
    "--format=plain",
    "--no-owner",
    "--no-privileges",
    "--quote-all-identifiers",
    // INSERTs rather than COPY: the restore path is a statement executor, so it
    // never needs the COPY protocol, and a corrupt row fails one statement
    // instead of an entire COPY block.
    "--inserts",
    "--rows-per-insert=500",
  ];
  for (const schema of EXCLUDED_SCHEMAS) {
    if (schema.startsWith("pg_") || schema === "information_schema") continue;
    args.push(`--exclude-schema=${schema}`);
  }

  // The password goes through the environment, never argv: argv is visible to
  // every process on the host via `ps`.
  const child = spawn(process.env.PG_DUMP_PATH || "pg_dump", args, {
    env: {
      ...process.env,
      PGPASSWORD: parsed.password,
      PGSSLMODE: parsed.sslMode ?? (parsed.host === "localhost" ? "prefer" : "require"),
      PGCONNECT_TIMEOUT: "10",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (d) => {
    // Bounded: a broken dump can emit a lot, and we only need the first error.
    if (stderr.length < 4000) stderr += String(d);
  });

  child.stdout.pipe(out, { end: false });

  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", (err) => {
      const failure = new DumpError(`pg_dump could not be started: ${err.message}`);
      out.destroy(failure);
      reject(failure);
    });
    child.on("close", (code) => {
      if (code === 0) {
        out.end();
        resolve();
        return;
      }
      const failure = new DumpError(
        `pg_dump exited with code ${code}: ${stderr.trim().split("\n").slice(-3).join(" ") || "no detail"}`,
      );
      out.destroy(failure);
      reject(failure);
    });
  });
  // Nothing else awaits this promise until the upload finishes; without a
  // no-op catch an early failure would be an unhandled rejection.
  finished.catch(() => {});

  return { stream: out, finished };
}

/* ---------------------------------------------------- vaultback-sql engine --- */

const PROLOGUE = [
  "SET statement_timeout = 0;",
  "SET lock_timeout = 0;",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = on;",
  "SET check_function_bodies = false;",
  "SET client_min_messages = warning;",
  "SET row_security = off;",
  "SELECT pg_catalog.set_config('search_path', '', false);",
  "",
].join("\n");

interface ColumnRow {
  schema: string;
  table: string;
  name: string;
  type: string;
  notnull: boolean;
  def: string | null;
  identity: string;
  generated: string;
  position: number;
}

/**
 * The pure-TypeScript dumper. Emits, in dependency order: extensions, schemas,
 * enum and domain types, sequences, functions, tables, data, constraints,
 * indexes, sequence values, views, row-level-security policies, triggers.
 *
 * Data is emitted through a server-side cursor and each value is rendered by
 * Postgres itself (`quote_literal(col::text) || '::type'`), so the dumper never
 * has to reimplement literal syntax for 40 types — the one class of bug that
 * would corrupt a restore quietly.
 */
async function* generateSqlDump(
  sql: SourceClient,
  header: string,
): AsyncGenerator<string> {
  yield header;
  yield PROLOGUE;

  /**
   * Empty the session's search_path before reading the catalog.
   *
   * `pg_get_expr`, `pg_get_viewdef`, `pg_get_functiondef` and friends render
   * names relative to the *current* search_path, so with the default `public`
   * in scope a serial default comes out as `nextval('customers_id_seq')` — which
   * then fails to restore, because the restore session has no search_path
   * either. Emptying it makes every generated name schema-qualified. pg_dump
   * does exactly this, for exactly this reason.
   */
  await sql.unsafe(`SELECT pg_catalog.set_config('search_path', '', false)`);

  /* extensions ---------------------------------------------------------- */
  const extensions = await sql.unsafe<{ name: string; schema: string }[]>(
    `SELECT e.extname AS name, n.nspname AS schema
       FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname <> 'plpgsql' ORDER BY e.extname`,
  );
  if (extensions.length) {
    yield "\n-- extensions\n";
    for (const ext of extensions) {
      yield `CREATE EXTENSION IF NOT EXISTS ${quoteIdent(ext.name)} WITH SCHEMA ${quoteIdent(ext.schema)};\n`;
    }
  }

  /* schemas ------------------------------------------------------------- */
  const schemas = await sql.unsafe<{ schema: string }[]>(
    `SELECT n.nspname AS schema FROM pg_namespace n
      WHERE ${schemaFilterSql()} ORDER BY n.nspname`,
  );
  yield "\n-- schemas\n";
  for (const s of schemas) {
    yield `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(s.schema)};\n`;
  }

  /* enum + domain types ------------------------------------------------- */
  const enums = await sql.unsafe<{ schema: string; name: string; labels: string }[]>(
    `SELECT n.nspname AS schema, t.typname AS name,
            string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE ${schemaFilterSql()}
      GROUP BY n.nspname, t.typname ORDER BY n.nspname, t.typname`,
  );
  if (enums.length) {
    yield "\n-- enum types\n";
    for (const e of enums) {
      yield `CREATE TYPE ${quoteIdent(e.schema)}.${quoteIdent(e.name)} AS ENUM (${e.labels});\n`;
    }
  }

  const domains = await sql.unsafe<
    { schema: string; name: string; base: string; notnull: boolean; def: string | null; check: string | null }[]
  >(
    `SELECT n.nspname AS schema, t.typname AS name,
            pg_catalog.format_type(t.typbasetype, t.typtypmod) AS base,
            t.typnotnull AS notnull,
            t.typdefault AS def,
            (SELECT string_agg(pg_get_constraintdef(c.oid), ' ')
               FROM pg_constraint c WHERE c.contypid = t.oid) AS check
       FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype = 'd' AND ${schemaFilterSql()}
      ORDER BY n.nspname, t.typname`,
  );
  if (domains.length) {
    yield "\n-- domains\n";
    for (const d of domains) {
      const parts = [`CREATE DOMAIN ${quoteIdent(d.schema)}.${quoteIdent(d.name)} AS ${d.base}`];
      if (d.def != null) parts.push(`DEFAULT ${d.def}`);
      if (d.notnull) parts.push("NOT NULL");
      if (d.check) parts.push(d.check);
      yield `${parts.join(" ")};\n`;
    }
  }

  /* sequences ----------------------------------------------------------- */
  const sequences = await sql.unsafe<
    {
      schema: string;
      name: string;
      dataType: string;
      increment: string;
      minValue: string;
      maxValue: string;
      startValue: string;
      cacheSize: string;
      cycle: boolean;
      ownedByTable: string | null;
      ownedByColumn: string | null;
      /** 'i' = owned by an identity column (implicit), 'a' = serial default. */
      deptype: string | null;
    }[]
  >(
    `SELECT n.nspname AS schema,
            c.relname AS name,
            pg_catalog.format_type(s.seqtypid, NULL) AS "dataType",
            s.seqincrement::text AS increment,
            s.seqmin::text AS "minValue",
            s.seqmax::text AS "maxValue",
            s.seqstart::text AS "startValue",
            s.seqcache::text AS "cacheSize",
            s.seqcycle AS cycle,
            dn.nspname || '.' || dc.relname AS "ownedByTable",
            a.attname AS "ownedByColumn",
            d.deptype AS deptype
       FROM pg_sequence s
       JOIN pg_class c ON c.oid = s.seqrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_depend d
              ON d.objid = c.oid AND d.classid = 'pg_class'::regclass
             AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
       LEFT JOIN pg_class dc ON dc.oid = d.refobjid
       LEFT JOIN pg_namespace dn ON dn.oid = dc.relnamespace
       LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
      WHERE ${schemaFilterSql()}
      ORDER BY n.nspname, c.relname`,
  );
  if (sequences.length) {
    yield "\n-- sequences\n";
    for (const s of sequences) {
      // An identity column creates its own sequence; emitting one here would
      // collide with the column definition.
      if (s.deptype === "i") continue;
      yield (
        `CREATE SEQUENCE IF NOT EXISTS ${quoteIdent(s.schema)}.${quoteIdent(s.name)}\n` +
        `    AS ${s.dataType}\n` +
        `    START WITH ${s.startValue}\n` +
        `    INCREMENT BY ${s.increment}\n` +
        `    MINVALUE ${s.minValue}\n` +
        `    MAXVALUE ${s.maxValue}\n` +
        `    CACHE ${s.cacheSize}${s.cycle ? "\n    CYCLE" : ""};\n`
      );
    }
  }

  /* functions ----------------------------------------------------------- */
  const functions = await sql.unsafe<{ def: string }[]>(
    `SELECT pg_get_functiondef(p.oid) AS def
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE ${schemaFilterSql()} AND p.prokind IN ('f', 'p')
      ORDER BY n.nspname, p.proname`,
  );
  if (functions.length) {
    yield "\n-- functions\n";
    for (const f of functions) yield `${f.def};\n`;
  }

  /* tables -------------------------------------------------------------- */
  const columns = await sql.unsafe<ColumnRow[]>(
    `SELECT n.nspname AS schema,
            c.relname AS "table",
            a.attname AS name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS notnull,
            pg_get_expr(d.adbin, d.adrelid) AS def,
            a.attidentity AS identity,
            a.attgenerated AS generated,
            a.attnum AS position
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE c.relkind IN ('r', 'p')
        AND c.relpersistence = 'p'
        AND NOT c.relispartition
        AND a.attnum > 0 AND NOT a.attisdropped
        AND ${schemaFilterSql()}
      ORDER BY n.nspname, c.relname, a.attnum`,
  );

  const byTable = new Map<string, ColumnRow[]>();
  for (const col of columns) {
    const key = `${col.schema}.${col.table}`;
    const list = byTable.get(key);
    if (list) list.push(col);
    else byTable.set(key, [col]);
  }

  yield "\n-- tables\n";
  for (const [key, cols] of byTable) {
    const [schema, table] = splitKey(key);
    const defs = cols.map((col) => {
      const parts = [`    ${quoteIdent(col.name)} ${col.type}`];
      if (col.generated === "s" && col.def) {
        parts.push(`GENERATED ALWAYS AS (${col.def}) STORED`);
      } else if (col.identity === "a" || col.identity === "d") {
        parts.push(
          `GENERATED ${col.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`,
        );
      } else if (col.def != null) {
        parts.push(`DEFAULT ${col.def}`);
      }
      if (col.notnull) parts.push("NOT NULL");
      return parts.join(" ");
    });
    yield `CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)} (\n${defs.join(",\n")}\n);\n`;
  }

  /* sequence ownership -------------------------------------------------- */
  const owned = sequences.filter(
    (s) => s.ownedByTable && s.ownedByColumn && s.deptype === "a",
  );
  if (owned.length) {
    yield "\n-- sequence ownership\n";
    for (const s of owned) {
      const [ownerSchema, ownerTable] = splitKey(s.ownedByTable as string);
      yield (
        `ALTER SEQUENCE ${quoteIdent(s.schema)}.${quoteIdent(s.name)} OWNED BY ` +
        `${quoteIdent(ownerSchema)}.${quoteIdent(ownerTable)}.${quoteIdent(s.ownedByColumn as string)};\n`
      );
    }
  }

  /* data ---------------------------------------------------------------- */
  yield "\n-- data\n";
  for (const [key, cols] of byTable) {
    const [schema, table] = splitKey(key);
    const insertable = cols.filter((c) => c.generated !== "s");
    if (!insertable.length) continue;

    const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    const columnList = insertable.map((c) => quoteIdent(c.name)).join(", ");
    const overriding = insertable.some((c) => c.identity === "a")
      ? " OVERRIDING SYSTEM VALUE"
      : "";

    const tupleExpr = insertable
      .map((c) => {
        const cast = c.type.replace(/'/g, "''");
        return `CASE WHEN ${quoteIdent(c.name)} IS NULL THEN 'NULL' ELSE quote_literal(${quoteIdent(
          c.name,
        )}::text) || '::${cast}' END`;
      })
      .join(", ");

    const query = `SELECT '(' || concat_ws(', ', ${tupleExpr}) || ')' AS tuple FROM ${target}`;

    let batch: string[] = [];
    let wrote = false;
    for await (const rows of sql.unsafe<{ tuple: string }[]>(query).cursor(500)) {
      for (const row of rows) batch.push(row.tuple);
      if (batch.length >= 500) {
        if (!wrote) {
          yield `\n-- ${schema}.${table}\n`;
          wrote = true;
        }
        yield `INSERT INTO ${target} (${columnList})${overriding} VALUES\n${batch.join(",\n")};\n`;
        batch = [];
      }
    }
    if (batch.length) {
      if (!wrote) yield `\n-- ${schema}.${table}\n`;
      yield `INSERT INTO ${target} (${columnList})${overriding} VALUES\n${batch.join(",\n")};\n`;
    }
  }

  /* constraints --------------------------------------------------------- */
  // Primary keys and uniques first, then checks, then foreign keys — a foreign
  // key cannot be added before the key it references exists.
  const constraints = await sql.unsafe<
    { schema: string; table: string; name: string; def: string; type: string }[]
  >(
    `SELECT n.nspname AS schema, c.relname AS "table", con.conname AS name,
            pg_get_constraintdef(con.oid) AS def, con.contype AS type
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${schemaFilterSql()} AND con.contype IN ('p', 'u', 'c', 'f')
      ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END,
               n.nspname, c.relname, con.conname`,
  );
  if (constraints.length) {
    yield "\n-- constraints\n";
    for (const con of constraints) {
      yield (
        `ALTER TABLE ${quoteIdent(con.schema)}.${quoteIdent(con.table)} ` +
        `ADD CONSTRAINT ${quoteIdent(con.name)} ${con.def};\n`
      );
    }
  }

  /* indexes ------------------------------------------------------------- */
  const indexes = await sql.unsafe<{ def: string }[]>(
    `SELECT pg_get_indexdef(i.indexrelid) AS def
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${schemaFilterSql()}
        AND NOT i.indisprimary
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid
        )
      ORDER BY n.nspname, c.relname`,
  );
  if (indexes.length) {
    yield "\n-- indexes\n";
    for (const idx of indexes) yield `${idx.def};\n`;
  }

  /* sequence positions -------------------------------------------------- */
  if (sequences.length) {
    yield "\n-- sequence positions\n";
    for (const s of sequences) {
      const ref = `${s.schema}.${s.name}`;
      const [{ last, called }] = await sql.unsafe<{ last: string; called: boolean }[]>(
        `SELECT last_value::text AS last, is_called AS called FROM ${quoteIdent(
          s.schema,
        )}.${quoteIdent(s.name)}`,
      );
      yield `SELECT pg_catalog.setval('${ref.replace(/'/g, "''")}', ${last}, ${called});\n`;
    }
  }

  /* views --------------------------------------------------------------- */
  const views = await sql.unsafe<{ schema: string; name: string; def: string; kind: string }[]>(
    `SELECT n.nspname AS schema, c.relname AS name,
            pg_get_viewdef(c.oid, true) AS def, c.relkind AS kind
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('v', 'm') AND ${schemaFilterSql()}
      ORDER BY n.nspname, c.relname`,
  );
  if (views.length) {
    yield "\n-- views\n";
    for (const v of views) {
      const keyword = v.kind === "m" ? "MATERIALIZED VIEW" : "VIEW";
      yield `CREATE ${keyword} ${quoteIdent(v.schema)}.${quoteIdent(v.name)} AS\n${v.def}\n`;
    }
  }

  /* row-level security -------------------------------------------------- */
  const rls = await sql.unsafe<{ schema: string; table: string; forced: boolean }[]>(
    `SELECT n.nspname AS schema, c.relname AS "table", c.relforcerowsecurity AS forced
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relrowsecurity AND ${schemaFilterSql()}`,
  );
  const policies = await sql.unsafe<
    {
      schema: string;
      table: string;
      name: string;
      permissive: string;
      roles: string;
      cmd: string;
      qual: string | null;
      withCheck: string | null;
    }[]
  >(
    `SELECT n.nspname AS schema, c.relname AS "table", p.polname AS name,
            CASE p.polpermissive WHEN true THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS permissive,
            COALESCE(
              (SELECT string_agg(quote_ident(r.rolname), ', ')
                 FROM pg_roles r WHERE r.oid = ANY (p.polroles)), 'PUBLIC') AS roles,
            CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                          WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
            pg_get_expr(p.polqual, p.polrelid) AS qual,
            pg_get_expr(p.polwithcheck, p.polrelid) AS "withCheck"
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${schemaFilterSql()}
      ORDER BY n.nspname, c.relname, p.polname`,
  );
  if (rls.length || policies.length) {
    yield "\n-- row level security\n";
    for (const r of rls) {
      yield `ALTER TABLE ${quoteIdent(r.schema)}.${quoteIdent(r.table)} ENABLE ROW LEVEL SECURITY;\n`;
      if (r.forced) {
        yield `ALTER TABLE ${quoteIdent(r.schema)}.${quoteIdent(r.table)} FORCE ROW LEVEL SECURITY;\n`;
      }
    }
    for (const p of policies) {
      const parts = [
        `CREATE POLICY ${quoteIdent(p.name)} ON ${quoteIdent(p.schema)}.${quoteIdent(p.table)}`,
        `AS ${p.permissive}`,
        `FOR ${p.cmd}`,
        `TO ${p.roles}`,
      ];
      if (p.qual) parts.push(`USING (${p.qual})`);
      if (p.withCheck) parts.push(`WITH CHECK (${p.withCheck})`);
      yield `${parts.join(" ")};\n`;
    }
  }

  /* triggers ------------------------------------------------------------ */
  const triggers = await sql.unsafe<{ def: string }[]>(
    `SELECT pg_get_triggerdef(t.oid) AS def
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND ${schemaFilterSql()}
      ORDER BY n.nspname, c.relname, t.tgname`,
  );
  if (triggers.length) {
    yield "\n-- triggers\n";
    for (const t of triggers) yield `${t.def};\n`;
  }

  yield "\n-- end of VaultBack snapshot\n";
}

function splitKey(key: string): [string, string] {
  const idx = key.indexOf(".");
  return [key.slice(0, idx), key.slice(idx + 1)];
}
