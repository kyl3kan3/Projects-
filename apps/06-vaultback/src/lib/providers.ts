/**
 * Provider adapters: what we know about each hosted-Postgres flavor from its
 * connection string alone, before touching the network.
 *
 * This is deliberately the first thing that runs on a pasted connection string.
 * Two of the three ways a backup product fails silently are decided here:
 * pointing pg_dump at a transaction pooler, and enforcing TLS.
 */

import type { Provider } from "@/db/schema";

export type { Provider };

export interface ParsedConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** sslmode from the query string, if the customer set one. */
  sslMode: string | null;
  params: Record<string, string>;
}

export class ConnectionStringError extends Error {}

/**
 * Parse a postgres:// URL without leaking the password anywhere. Node's URL
 * parser handles most of it; what it does not do is reject the near-misses that
 * customers actually paste (a psql command line, a JDBC URL, the Supabase
 * dashboard's `[YOUR-PASSWORD]` placeholder left in).
 */
export function parseConnectionString(raw: string): ParsedConnection {
  const input = raw.trim();
  if (!input) throw new ConnectionStringError("Paste a connection string to continue");

  if (input.startsWith("jdbc:")) {
    throw new ConnectionStringError(
      "That is a JDBC URL. VaultBack needs the postgres:// form your provider also lists.",
    );
  }
  if (/^psql\s/.test(input)) {
    throw new ConnectionStringError(
      "That is a psql command. Paste just the postgres:// URL inside it.",
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(input)) {
    throw new ConnectionStringError("A connection string must start with postgres:// or postgresql://");
  }
  if (/\[YOUR-PASSWORD\]|\[your-password\]|<password>/.test(input)) {
    throw new ConnectionStringError(
      "The password placeholder is still in there — replace [YOUR-PASSWORD] with the real password.",
    );
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ConnectionStringError("That connection string could not be parsed");
  }

  const host = url.hostname;
  if (!host) throw new ConnectionStringError("The connection string has no host");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new ConnectionStringError("The connection string has no database name");
  const user = decodeURIComponent(url.username);
  if (!user) throw new ConnectionStringError("The connection string has no username");

  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key.toLowerCase()] = value;
  });

  return {
    host,
    port: url.port ? Number(url.port) : 5432,
    database,
    user,
    password: decodeURIComponent(url.password),
    sslMode: params.sslmode ?? null,
    params,
  };
}

/** Hostname patterns, most specific first. */
const PATTERNS: { provider: Provider; test: RegExp }[] = [
  { provider: "supabase", test: /(^|\.)supabase\.(co|com|net)$/i },
  { provider: "supabase", test: /(^|\.)pooler\.supabase\.com$/i },
  { provider: "neon", test: /(^|\.)neon\.(tech|build)$/i },
  { provider: "neon", test: /(^|\.)aws\.neon\.tech$/i },
  { provider: "planetscale", test: /(^|\.)psdb\.cloud$/i },
  { provider: "planetscale", test: /(^|\.)planetscale\.(com|dev)$/i },
  { provider: "railway", test: /(^|\.)railway\.(app|internal)$/i },
  { provider: "railway", test: /(^|\.)rlwy\.net$/i },
];

export function detectProvider(host: string): Provider {
  for (const { provider, test } of PATTERNS) {
    if (test.test(host)) return provider;
  }
  return "generic";
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  supabase: "Supabase",
  neon: "Neon",
  planetscale: "PlanetScale",
  railway: "Railway",
  generic: "Postgres",
};

/**
 * Does this look like a transaction pooler rather than a direct connection?
 *
 * It matters because pg_dump against PgBouncer/Supavisor in transaction mode
 * fails or silently produces an inconsistent dump — it cannot hold the snapshot
 * transaction it needs. We warn loudly and keep going, because some poolers do
 * run in session mode and refusing outright would block legitimate setups.
 */
export function detectPooled(host: string, port: number): boolean {
  if (/^pooler\./i.test(host) || /(^|[.-])pooler\./i.test(host)) return true;
  if (/pgbouncer/i.test(host)) return true;
  // Supabase Supavisor: 6543 transaction mode, 5432 session mode.
  // Neon's pooled endpoint is the "-pooler" host on the normal port.
  if (port === 6543) return true;
  if (/-pooler\./i.test(host)) return true;
  return false;
}

/**
 * Should TLS be required? Every managed provider in scope terminates TLS, and a
 * plaintext dump of a production database across the public internet is
 * indefensible. Localhost is the documented exception, for developers testing.
 */
export function requiresTls(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  if (/\.local$/i.test(host)) return false;
  // RFC1918 / link-local: a private network the customer already controls.
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

/** Human identity for a connection, safe to log and display. No credentials. */
export function fingerprint(parsed: ParsedConnection): string {
  return `${parsed.host}:${parsed.port}/${parsed.database}`;
}

/** Redact a connection string for display: keeps shape, drops the secret. */
export function maskConnectionString(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.password) url.password = "•••••••";
    return url.toString();
  } catch {
    return "postgres://•••••••";
  }
}

/**
 * A connection string safe to hand to `postgres()` / `pg_dump`, with TLS forced
 * where TLS is required and left alone where the customer already chose.
 */
export function normalizeForDump(raw: string): string {
  const url = new URL(raw.trim());
  const host = url.hostname;
  if (requiresTls(host) && !url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

export interface ProviderGuidance {
  /** Docs line shown under the connection field. */
  note: string;
  /** Copy-paste SQL creating a least-privilege backup role. */
  readOnlyRoleSql: string;
  /** What to do about the pooler, when one was detected. */
  poolerAdvice: string;
}

const ROLE_SQL = (comment: string) => `-- ${comment}
CREATE ROLE vaultback_backup WITH LOGIN PASSWORD 'a-long-random-password';
GRANT pg_read_all_data TO vaultback_backup;
GRANT USAGE ON SCHEMA public TO vaultback_backup;`;

export const PROVIDER_GUIDANCE: Record<Provider, ProviderGuidance> = {
  supabase: {
    note: "Settings → Database → Connection string → URI. Use the direct connection, not the pooler.",
    readOnlyRoleSql: ROLE_SQL("Run in Supabase SQL Editor, then use vaultback_backup in the URL"),
    poolerAdvice:
      "This is Supavisor. Swap the host for the direct db.<ref>.supabase.co host and port 5432 — a pooler cannot hold the snapshot transaction a consistent dump needs.",
  },
  neon: {
    note: "Dashboard → Connection details. Either endpoint works; the direct one dumps faster.",
    readOnlyRoleSql: ROLE_SQL("Run against your Neon database as the owner role"),
    poolerAdvice:
      "This is Neon's pooled endpoint. Remove '-pooler' from the host for backups; pooled connections cannot hold a dump snapshot open.",
  },
  planetscale: {
    note: "PlanetScale Postgres only. The MySQL product is not supported (see README).",
    readOnlyRoleSql: ROLE_SQL("Run as the branch owner"),
    poolerAdvice: "Use the direct branch endpoint rather than the pooled one for backups.",
  },
  railway: {
    note: "Postgres service → Variables → DATABASE_PUBLIC_URL. The internal URL is not reachable from here.",
    readOnlyRoleSql: ROLE_SQL("Run via Railway's Postgres query tab"),
    poolerAdvice: "Point backups at the direct Postgres service, not a pgbouncer sidecar.",
  },
  generic: {
    note: "Any Postgres 12+ reachable over TLS works. A read-only role is strongly recommended.",
    readOnlyRoleSql: ROLE_SQL("Run as a superuser on your Postgres server"),
    poolerAdvice:
      "This looks like a transaction pooler. Point backups at the direct Postgres port instead.",
  },
};
