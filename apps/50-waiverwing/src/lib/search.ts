/**
 * src/lib/search.ts
 *
 * Participant search and coverage — the retrieval the product is sold on.
 * Search-as-you-type across name, email and phone via pg_trgm, and every result
 * answers the only question that matters at a counter: **current waiver on
 * file?**
 *
 * Coverage is derived in exactly one place (`deriveCoverage`) and used by the
 * search rows, the participant detail, the check-in tap and the incident linker,
 * so the amber row and the rejected check-in can never disagree.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, getSql } from "@/db";
import { participants, signatures, type Participant, type Signature } from "@/db/schema";

export {
  COVERAGE_LABEL,
  deriveCoverage,
  type Coverage,
  type CoverageState,
} from "@/lib/coverage";
import { deriveCoverage, type Coverage, type CoverageState } from "@/lib/coverage";

export interface SearchResult {
  participantId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  isMinor: boolean;
  guardianName: string | null;
  coverage: Coverage;
  reason: string | null;
  lastSignedAt: Date | null;
  coverageEndsAt: Date | null;
  provingSignatureId: string | null;
  email: string | null;
  phone: string | null;
}

interface SearchRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  dob: string | null;
  is_minor: boolean;
  guardian_first: string | null;
  guardian_last: string | null;
}

const SELECT_COLUMNS = `
  p.id, p.first_name, p.last_name, p.email, p.phone, p.dob, p.is_minor,
  g.first_name as guardian_first, g.last_name as guardian_last
`;

/**
 * The exact-ish pass: everything that can be answered from a trigram index with
 * a bounded scan. Each branch carries its own LIMIT so one broad branch cannot
 * make the query quadratic, and the outer sort is on a small integer rank rather
 * than on a similarity computed over every match — which is what made an earlier
 * single-OR-query version take 300ms on a 100k-row table.
 */
async function exactHits(accountId: string, q: string, limit: number): Promise<SearchRow[]> {
  const sql = getSql();
  const prefix = `${q}%`;
  const contains = `%${q}%`;
  const digits = q.replace(/\D+/g, "");

  return (await sql`
    with hits as (
      (select p.id, 0 as rank from participants p
        where p.account_id = ${accountId}
          and (lower(p.first_name) || ' ' || lower(p.last_name)) like ${prefix}
        limit ${limit})
      union all
      (select p.id, 1 from participants p
        where p.account_id = ${accountId} and lower(p.last_name) like ${prefix}
        limit ${limit})
      union all
      (select p.id, 2 from participants p
        where p.account_id = ${accountId} and lower(coalesce(p.email, '')) like ${contains}
        limit ${limit})
      union all
      (select p.id, 3 from participants p
        where p.account_id = ${accountId}
          and ${digits.length >= 3 ? sql`coalesce(p.phone, '') like ${`%${digits}%`}` : sql`false`}
        limit ${limit})
    ), ranked as (
      select id, min(rank) as rank from hits group by id
    )
    select ${sql.unsafe(SELECT_COLUMNS)}
    from ranked r
    join participants p on p.id = r.id
    left join participants g on g.id = p.guardian_participant_id
    order by r.rank, p.last_name, p.first_name
    limit ${limit}
  `) as unknown as SearchRow[];
}

/**
 * The typo pass: trigram similarity, against the full name and against the
 * surname on its own. The surname branch matters more than it looks — "nguyan"
 * scores badly against "sam nguyen" because the first name dilutes it, and well
 * against "nguyen".
 *
 * Only run when the exact pass came up nearly empty, because similarity has to
 * be computed for every row the index bitmap returns, and on a large account
 * with repetitive names that set can be big.
 */
async function fuzzyHits(accountId: string, q: string, limit: number): Promise<SearchRow[]> {
  const sql = getSql();
  return (await sql`
    with hits as (
      (select p.id,
              similarity(lower(p.first_name) || ' ' || lower(p.last_name), ${q}) as sim
         from participants p
        where p.account_id = ${accountId}
          and (lower(p.first_name) || ' ' || lower(p.last_name)) % ${q}
        order by 2 desc limit ${limit})
      union all
      (select p.id, similarity(lower(p.last_name), ${q}) as sim
         from participants p
        where p.account_id = ${accountId} and lower(p.last_name) % ${q}
        order by 2 desc limit ${limit})
    ), ranked as (
      select id, max(sim) as sim from hits group by id
    )
    select ${sql.unsafe(SELECT_COLUMNS)}
    from ranked r
    join participants p on p.id = r.id
    left join participants g on g.id = p.guardian_participant_id
    order by r.sim desc, p.last_name, p.first_name
    limit ${limit}
  `) as unknown as SearchRow[];
}

/**
 * Search-as-you-type across name, email and phone.
 *
 * Two passes rather than one query: the exact pass answers almost every real
 * search at the counter (staff type the start of a name), and the fuzzy pass —
 * the expensive one — only runs when the exact pass found nearly nothing, which
 * is precisely when a typo is the likely explanation.
 */
export async function searchParticipants(
  accountId: string,
  query: string,
  opts: { at?: Date; timeZone?: string; limit?: number } = {},
): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const limit = opts.limit ?? 25;

  let rows = await exactHits(accountId, q, limit);

  if (rows.length < 5 && q.length >= 3) {
    const seen = new Set(rows.map((r) => r.id));
    for (const row of await fuzzyHits(accountId, q, limit)) {
      if (!seen.has(row.id)) {
        rows.push(row);
        seen.add(row.id);
      }
    }
    rows = rows.slice(0, limit);
  }

  if (!rows.length) return [];
  return hydrateCoverage(accountId, rows, opts);
}

async function hydrateCoverage(
  accountId: string,
  rows: SearchRow[],
  opts: { at?: Date; timeZone?: string },
): Promise<SearchResult[]> {
  const db = getDb();
  const at = opts.at ?? new Date();
  const tz = opts.timeZone ?? "UTC";
  const ids = rows.map((r) => r.id);

  const sigs = await db
    .select()
    .from(signatures)
    .where(and(eq(signatures.accountId, accountId), inArray(signatures.participantId, ids)))
    .orderBy(desc(signatures.signedAt));

  const byParticipant = new Map<string, Signature[]>();
  for (const s of sigs) {
    const list = byParticipant.get(s.participantId) ?? [];
    list.push(s);
    byParticipant.set(s.participantId, list);
  }

  return rows.map((r) => {
    const state = deriveCoverage(byParticipant.get(r.id) ?? [], r.dob, at, tz);
    return {
      participantId: r.id,
      displayName: `${r.first_name} ${r.last_name}`,
      firstName: r.first_name,
      lastName: r.last_name,
      isMinor: r.is_minor,
      guardianName:
        r.guardian_first && r.guardian_last ? `${r.guardian_first} ${r.guardian_last}` : null,
      coverage: state.coverage,
      reason: state.reason,
      lastSignedAt: state.latestSignature?.signedAt ?? null,
      coverageEndsAt: state.endsAt,
      provingSignatureId: state.provingSignature?.id ?? null,
      email: r.email,
      phone: r.phone,
    };
  });
}

/** Coverage for one participant, for the detail screen and the check-in tap. */
export async function participantCoverage(
  accountId: string,
  participantId: string,
  opts: { at?: Date; timeZone?: string } = {},
): Promise<{ participant: Participant; state: CoverageState; guardian: Participant | null } | null> {
  const db = getDb();
  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.accountId, accountId)));
  if (!participant) return null;

  const sigs = await db
    .select()
    .from(signatures)
    .where(eq(signatures.participantId, participantId))
    .orderBy(desc(signatures.signedAt));

  let guardian: Participant | null = null;
  if (participant.guardianParticipantId) {
    const [g] = await db
      .select()
      .from(participants)
      .where(eq(participants.id, participant.guardianParticipantId));
    guardian = g ?? null;
  }

  return {
    participant,
    state: deriveCoverage(sigs, participant.dob, opts.at ?? new Date(), opts.timeZone ?? "UTC"),
    guardian,
  };
}

/** Minors linked to a guardian — the "signs for" rows on a detail screen. */
export async function linkedMinors(accountId: string, guardianId: string): Promise<Participant[]> {
  const db = getDb();
  return db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.accountId, accountId),
        eq(participants.guardianParticipantId, guardianId),
      ),
    )
    .orderBy(participants.firstName);
}

/** The whole database, newest first — the participants tab with no query. */
export async function recentParticipants(
  accountId: string,
  opts: { at?: Date; timeZone?: string; limit?: number } = {},
): Promise<SearchResult[]> {
  const sql = getSql();
  const rows = (await sql`
    select
      p.id, p.first_name, p.last_name, p.email, p.phone, p.dob, p.is_minor,
      g.first_name as guardian_first, g.last_name as guardian_last
    from participants p
    left join participants g on g.id = p.guardian_participant_id
    where p.account_id = ${accountId}
    order by p.updated_at desc
    limit ${opts.limit ?? 40}
  `) as unknown as SearchRow[];
  if (!rows.length) return [];
  return hydrateCoverage(accountId, rows, opts);
}
