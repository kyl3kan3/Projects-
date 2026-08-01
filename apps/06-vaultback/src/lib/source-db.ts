/**
 * Talking to *customer* databases — the source of every backup and the target of
 * every restore. Deliberately separate from `src/db` (our own control plane) so
 * the two can never be confused in a query.
 *
 * Rules that live here:
 *  - TLS is forced everywhere except localhost and private ranges.
 *  - Connections are short-lived and few: we are a guest in someone's
 *    production database and must not sit on their connection budget.
 *  - Nothing in this file ever logs a connection string.
 */

import postgres from "postgres";
import { parseConnectionString, requiresTls } from "@/lib/providers";

export interface SourceClientOptions {
  /** Statement timeout in ms. A dump reads for a long time; a check must not. */
  statementTimeoutMs?: number;
  max?: number;
  connectTimeoutSeconds?: number;
}

export type SourceClient = ReturnType<typeof postgres>;

export function connectSource(
  connectionString: string,
  opts: SourceClientOptions = {},
): SourceClient {
  const parsed = parseConnectionString(connectionString);
  return postgres(connectionString, {
    max: opts.max ?? 2,
    connect_timeout: opts.connectTimeoutSeconds ?? 10,
    idle_timeout: 20,
    // Poolers in transaction mode cannot carry prepared statements.
    prepare: false,
    ssl: requiresTls(parsed.host) ? "require" : false,
    connection: {
      application_name: "vaultback",
      // 0 means "no limit", which is what a multi-hour dump needs.
      statement_timeout: opts.statementTimeoutMs ?? 0,
    },
    onnotice: () => {},
  });
}

export interface TableInfo {
  schema: string;
  table: string;
  rows: number;
}

export interface Inspection {
  postgresVersion: string;
  /** Server major version, for pg_dump skew checks. */
  serverMajor: number;
  sizeBytes: number;
  tables: TableInfo[];
  totalRows: number;
  /** True when row counts are `reltuples` estimates rather than exact counts. */
  estimated: boolean;
  isSuperuser: boolean;
  /** Tables the role could not read at all — a permissions finding. */
  unreadableTables: string[];
  /** Was this session actually encrypted in transit? */
  encrypted: boolean;
}

/** Schemas we never dump: system catalogs and provider-managed internals. */
export const EXCLUDED_SCHEMAS = [
  "pg_catalog",
  "information_schema",
  "pg_toast",
  // Supabase-managed schemas: owned by the platform, recreated by the platform.
  "auth",
  "storage",
  "graphql",
  "graphql_public",
  "realtime",
  "supabase_functions",
  "supabase_migrations",
  "extensions",
  "vault",
  "pgsodium",
  "pgsodium_masks",
  "net",
  "cron",
];

/** SQL predicate excluding those schemas, for `n` aliased to pg_namespace. */
export function schemaFilterSql(alias = "n"): string {
  const list = EXCLUDED_SCHEMAS.map((s) => `'${s}'`).join(", ");
  return `${alias}.nspname NOT IN (${list}) AND ${alias}.nspname NOT LIKE 'pg\\_%'`;
}

/**
 * Read everything the connect-a-database flow and the dump engine need.
 *
 * `exactCounts` is the interesting flag. The connect flow uses estimates so a
 * 200 GB database does not make onboarding hang. A dump uses exact counts,
 * because those numbers become the expected values a restore drill verifies
 * against — verifying a restore against `reltuples` would make the headline
 * feature a lie.
 */
export async function inspectDatabase(
  sql: SourceClient,
  opts: { exactCounts?: boolean } = {},
): Promise<Inspection> {
  const exact = opts.exactCounts ?? false;

  const [{ version }] = await sql<{ version: string }[]>`SELECT version() AS version`;
  const majorMatch = /PostgreSQL (\d+)/.exec(version);
  const serverMajor = majorMatch ? Number(majorMatch[1]) : 0;

  const [{ size }] = await sql<{ size: string }[]>`
    SELECT pg_database_size(current_database())::text AS size
  `;

  const [{ superuser }] = await sql<{ superuser: boolean }[]>`
    SELECT COALESCE(bool_or(rolsuper), false) AS superuser
    FROM pg_roles WHERE rolname = current_user
  `;

  const [{ encrypted }] = await sql<{ encrypted: boolean }[]>`
    SELECT COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS encrypted
  `;

  const tableRows = await sql.unsafe<{ schema: string; table: string; estimate: string }[]>(
    `SELECT n.nspname AS schema,
            c.relname AS "table",
            GREATEST(c.reltuples, 0)::bigint::text AS estimate
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND c.relpersistence = 'p'
        AND NOT c.relispartition
        AND ${schemaFilterSql()}
      ORDER BY n.nspname, c.relname`,
  );

  const tables: TableInfo[] = [];
  const unreadableTables: string[] = [];
  let totalRows = 0;

  for (const row of tableRows) {
    if (!exact) {
      const rows = Number(row.estimate);
      tables.push({ schema: row.schema, table: row.table, rows });
      totalRows += rows;
      continue;
    }
    try {
      const [{ n }] = await sql.unsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM ${quoteIdent(row.schema)}.${quoteIdent(row.table)}`,
      );
      const rows = Number(n);
      tables.push({ schema: row.schema, table: row.table, rows });
      totalRows += rows;
    } catch {
      // A table the role cannot read is a permissions finding, not a crash.
      unreadableTables.push(`${row.schema}.${row.table}`);
    }
  }

  return {
    postgresVersion: version.split(" on ")[0],
    serverMajor,
    sizeBytes: Number(size),
    tables,
    totalRows,
    estimated: !exact,
    isSuperuser: superuser,
    unreadableTables,
    encrypted,
  };
}

/** Can this role actually read table data, or only see the catalog? */
export async function probeReadPermission(
  sql: SourceClient,
  tables: TableInfo[],
): Promise<{ ok: boolean; blocked: string[] }> {
  const blocked: string[] = [];
  // Probing every table on a 400-table schema is slow and pointless; the first
  // handful is enough to catch a missing grant, which is an all-or-nothing
  // mistake in practice.
  for (const t of tables.slice(0, 12)) {
    try {
      await sql.unsafe(
        `SELECT 1 FROM ${quoteIdent(t.schema)}.${quoteIdent(t.table)} LIMIT 1`,
      );
    } catch {
      blocked.push(`${t.schema}.${t.table}`);
    }
  }
  return { ok: blocked.length === 0, blocked };
}

/** Is this database empty enough to restore into without overwriting anything? */
export async function isEmptyDatabase(sql: SourceClient): Promise<boolean> {
  const rows = await sql.unsafe<{ n: string }[]>(
    `SELECT count(*)::text AS n
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S')
        AND ${schemaFilterSql()}`,
  );
  return Number(rows[0].n) === 0;
}

/** Double-quote an identifier for interpolation into raw SQL. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
