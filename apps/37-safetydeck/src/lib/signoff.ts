/**
 * Sign-off ingestion: the server half of the offline contract.
 *
 * The crew PWA writes every signature to a local outbox first, online or not,
 * and drains it here. Four rules make the records defensible:
 *
 *  1. **Idempotent by (instance, employee).** The unique index means a retry, a
 *     double-tap, or two phones at the same huddle produce one signature per
 *     person. First sync wins; the duplicate is acknowledged and dropped, so the
 *     device can clear its outbox instead of retrying forever.
 *  2. **Immutable after sync.** Nothing updates a `sign_offs` row — not this
 *     module, not an action, and not a stray query: a database trigger rejects
 *     UPDATE and DELETE outright. Voiding appends a correction.
 *  3. **Both clocks, honestly.** The device's time at the huddle and the
 *     server's time at sync are both stored and both displayed. A signature
 *     captured at 07:12 and synced at 16:40 says exactly that; nothing is
 *     back-dated to look contemporaneous.
 *  4. **Roster-scoped.** An employee id that is not on this crew's roster is
 *     rejected rather than quietly attached to the wrong company.
 */

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  crews,
  employees,
  signOffCorrections,
  signOffs,
  talkInstances,
  talks,
  type Employee,
  type SignOff,
} from "@/db/schema";
import { verifyCrewToken } from "@/lib/crew-token";
import { newObjectKey, putObject } from "@/lib/storage";
import { weekStart, type IsoDate } from "@/lib/dates";

/* ------------------------------------------------------------- the payload --- */

const signatureSchema = z.object({
  employeeId: z.string().uuid(),
  /** SVG path data. Bounded: a signature is a few hundred bytes, not a novel. */
  signaturePath: z.string().min(4).max(60_000),
  signatureWidth: z.number().int().min(40).max(2000),
  signatureHeight: z.number().int().min(40).max(2000),
  /** The device's clock at the moment of signing. */
  signedAt: z.string().datetime({ offset: true }),
  capturedOffline: z.boolean().default(false),
  /** Stable per-entry id from the outbox, echoed back in the ack. */
  outboxId: z.string().min(1).max(80),
});

export const syncPayloadSchema = z.object({
  token: z.string().min(10),
  deviceId: z.string().min(4).max(80),
  signatures: z.array(signatureSchema).max(200).default([]),
  sitePhoto: z
    .object({
      /** Base64 without a data: prefix. ~2.7MB of base64 ≈ 2MB of JPEG. */
      base64: z.string().min(32).max(2_800_000),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    })
    .optional(),
  gps: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
  absentEmployeeIds: z.array(z.string().uuid()).max(200).optional(),
  /** The foreman closing the huddle with absentees noted. */
  closeOut: z.boolean().optional(),
});

export type SyncPayload = z.infer<typeof syncPayloadSchema>;

export interface SyncAck {
  outboxId: string;
  status: "stored" | "duplicate" | "rejected";
  reason?: string;
}

export interface SyncResult {
  instanceId: string;
  acks: SyncAck[];
  signedCount: number;
  rosterCount: number;
  completed: boolean;
  photoStored: boolean;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Ingest one outbox drain. Everything is keyed off the crew token, because the
 * caller is a phone with no account — the token is the authorisation.
 */
export async function ingestSync(payload: SyncPayload): Promise<SyncResult> {
  const verified = await verifyCrewToken(payload.token);
  if (!verified.ok) {
    throw new SyncError(
      verified.reason === "expired"
        ? "This crew link has expired. Ask the office to resend it — your signatures are still saved on this phone."
        : "This crew link is not valid.",
      401,
      verified.reason,
    );
  }

  const db = getDb();
  const [row] = await db
    .select({ instance: talkInstances, crew: crews })
    .from(talkInstances)
    .innerJoin(crews, eq(crews.id, talkInstances.crewId))
    .where(eq(talkInstances.id, verified.payload.ti));

  if (!row) throw new SyncError("That talk no longer exists.", 404, "missing");
  // A token that verifies but is no longer the instance's current token has been
  // superseded by a resend. Refuse it: otherwise a link forwarded out of a group
  // text keeps working after the office revoked it.
  if (row.instance.tokenHash !== verified.tokenHash) {
    throw new SyncError(
      "This link was replaced by a newer one. Open the most recent link the office sent.",
      401,
      "superseded",
    );
  }

  const roster = await rosterFor(row.crew.companyId, row.crew.id);
  const rosterIds = new Set(roster.map((e) => e.id));

  const acks: SyncAck[] = [];
  for (const sig of payload.signatures) {
    if (!rosterIds.has(sig.employeeId)) {
      acks.push({
        outboxId: sig.outboxId,
        status: "rejected",
        reason: "That person is not on this crew's roster.",
      });
      continue;
    }
    const [stored] = await db
      .insert(signOffs)
      .values({
        companyId: row.crew.companyId,
        talkInstanceId: row.instance.id,
        employeeId: sig.employeeId,
        signaturePath: sig.signaturePath,
        signatureWidth: sig.signatureWidth,
        signatureHeight: sig.signatureHeight,
        signedAt: new Date(sig.signedAt),
        deviceId: payload.deviceId,
        capturedOffline: sig.capturedOffline,
      })
      .onConflictDoNothing({
        target: [signOffs.talkInstanceId, signOffs.employeeId],
      })
      .returning({ id: signOffs.id });

    acks.push({
      outboxId: sig.outboxId,
      // A duplicate is a success from the device's point of view: the record
      // exists, so stop retrying. Same person cannot sign twice.
      status: stored ? "stored" : "duplicate",
    });
  }

  let photoStored = false;
  let sitePhotoKey = row.instance.sitePhotoKey;
  if (payload.sitePhoto && !sitePhotoKey) {
    const ext = payload.sitePhoto.contentType === "image/png" ? "png" : payload.sitePhoto.contentType === "image/webp" ? "webp" : "jpg";
    const key = newObjectKey(row.crew.companyId, "huddle", ext);
    await putObject(
      key,
      Buffer.from(payload.sitePhoto.base64, "base64"),
      payload.sitePhoto.contentType,
      row.crew.companyId,
    );
    sitePhotoKey = key;
    photoStored = true;
  }

  // Absentees are whoever the foreman closed out without a signature — but never
  // someone who *has* one. A phone that reloaded mid-huddle can send a close-out
  // listing a person whose signature synced from another device (or from its own
  // outbox seconds earlier), and a record that says "absent" beside a signature
  // is worse than either fact alone.
  const signedIds = new Set(
    (
      await db
        .select({ employeeId: signOffs.employeeId })
        .from(signOffs)
        .where(eq(signOffs.talkInstanceId, row.instance.id))
    ).map((s) => s.employeeId),
  );
  const absent = (payload.absentEmployeeIds ?? row.instance.absentEmployeeIds ?? []).filter(
    (id) => rosterIds.has(id) && !signedIds.has(id),
  );
  const accountedFor = new Set([...signedIds, ...absent]);
  const everyoneAccountedFor = roster.length > 0 && accountedFor.size >= roster.length;
  const completed = row.instance.status === "completed" || payload.closeOut === true || everyoneAccountedFor;

  const capturedOffline = payload.signatures.some((s) => s.capturedOffline);
  await db
    .update(talkInstances)
    .set({
      status: completed ? "completed" : signedIds.size > 0 ? "in_progress" : row.instance.status,
      completedAt: completed ? (row.instance.completedAt ?? new Date()) : row.instance.completedAt,
      closedByForeman: payload.closeOut === true ? true : row.instance.closedByForeman,
      absentEmployeeIds: absent.length > 0 ? absent : row.instance.absentEmployeeIds,
      gpsLat: payload.gps?.lat ?? row.instance.gpsLat,
      gpsLng: payload.gps?.lng ?? row.instance.gpsLng,
      sitePhotoKey,
      syncedFromOffline: row.instance.syncedFromOffline || capturedOffline,
    })
    .where(eq(talkInstances.id, row.instance.id));

  return {
    instanceId: row.instance.id,
    acks,
    signedCount: signedIds.size,
    rosterCount: roster.length,
    completed,
    photoStored,
  };
}

/**
 * The crew's roster: everyone assigned to the crew, plus unassigned floaters —
 * a floater who shows up to the huddle has to be able to sign.
 */
export async function rosterFor(companyId: string, crewId: string): Promise<Employee[]> {
  const db = getDb();
  const all = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.active, true)))
    .orderBy(asc(employees.name));
  return all.filter((e) => e.crewId === crewId || e.crewId === null);
}

/**
 * Void a signature. This never deletes: it appends a correction and leaves the
 * original in place, which is the difference between a record and a draft.
 */
export async function voidSignOff(
  companyId: string,
  signOffId: string,
  actor: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length < 4) throw new Error("Say why — the correction is part of the record");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(signOffs)
    .where(and(eq(signOffs.id, signOffId), eq(signOffs.companyId, companyId)));
  if (!existing) throw new Error("That signature is not on this company's records");
  await db.insert(signOffCorrections).values({
    companyId,
    signOffId,
    actor,
    reason: reason.trim(),
  });
}

/* ---------------------------------------------------- the attendance pivot --- */

export interface AttendanceCell {
  /** null = no talk was scheduled for that crew that week. */
  state: "signed" | "absent" | "missed" | "pending" | "none";
  signedAt: Date | null;
  syncedAt: Date | null;
  capturedOffline: boolean;
}

export interface AttendanceMatrix {
  weeks: IsoDate[];
  rows: {
    employee: Employee;
    crewName: string | null;
    cells: AttendanceCell[];
    signedCount: number;
  }[];
}

/**
 * The employees × weeks pivot behind the dashboard matrix and the binder page.
 *
 * Note the join predicates are all fully qualified: a column left unqualified in
 * a grouped select binds to whichever alias is nearest, which is how a matrix
 * ends up rendering an honest-looking grid of zeros.
 */
export async function attendanceMatrix(
  companyId: string,
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
): Promise<AttendanceMatrix> {
  const db = getDb();
  const start = weekStart(rangeStart);

  const weeks: IsoDate[] = [];
  for (let w = start; w <= rangeEnd; w = addWeek(w)) weeks.push(w);

  const staff = await db
    .select({ employee: employees, crewName: crews.name })
    .from(employees)
    .leftJoin(crews, eq(crews.id, employees.crewId))
    .where(eq(employees.companyId, companyId))
    .orderBy(asc(employees.name));

  const instances = await db
    .select({
      id: talkInstances.id,
      crewId: talkInstances.crewId,
      weekOf: talkInstances.weekOf,
      status: talkInstances.status,
      absent: talkInstances.absentEmployeeIds,
    })
    .from(talkInstances)
    .where(
      and(
        eq(talkInstances.companyId, companyId),
        gte(talkInstances.weekOf, start),
        lte(talkInstances.weekOf, rangeEnd),
      ),
    );

  const instanceIds = instances.map((i) => i.id);
  const sigs = instanceIds.length
    ? await db
        .select()
        .from(signOffs)
        .where(inArray(signOffs.talkInstanceId, instanceIds))
    : [];

  const rows = staff.map(({ employee, crewName }) => {
    let signedCount = 0;
    const cells = weeks.map<AttendanceCell>((week) => {
      const instance = instances.find(
        (i) => i.weekOf === week && (i.crewId === employee.crewId || employee.crewId === null),
      );
      if (!instance) {
        return { state: "none", signedAt: null, syncedAt: null, capturedOffline: false };
      }
      const sig = sigs.find(
        (s) => s.talkInstanceId === instance.id && s.employeeId === employee.id,
      );
      if (sig) {
        signedCount += 1;
        return {
          state: "signed",
          signedAt: sig.signedAt,
          syncedAt: sig.syncedAt,
          capturedOffline: sig.capturedOffline,
        };
      }
      if ((instance.absent ?? []).includes(employee.id)) {
        return { state: "absent", signedAt: null, syncedAt: null, capturedOffline: false };
      }
      return {
        state: instance.status === "missed" ? "missed" : "pending",
        signedAt: null,
        syncedAt: null,
        capturedOffline: false,
      };
    });
    return { employee, crewName, cells, signedCount };
  });

  return { weeks, rows };
}

function addWeek(iso: IsoDate): IsoDate {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** One instance with everything the detail screen and the binder need. */
export async function instanceDetail(companyId: string, instanceId: string) {
  const db = getDb();
  const [row] = await db
    .select({ instance: talkInstances, crew: crews, talk: talks })
    .from(talkInstances)
    .innerJoin(crews, eq(crews.id, talkInstances.crewId))
    .innerJoin(talks, eq(talks.id, talkInstances.talkId))
    .where(and(eq(talkInstances.id, instanceId), eq(talkInstances.companyId, companyId)));
  if (!row) return null;

  const roster = await rosterFor(companyId, row.crew.id);
  const sigs = await db
    .select()
    .from(signOffs)
    .where(eq(signOffs.talkInstanceId, instanceId))
    .orderBy(asc(signOffs.signedAt));
  const corrections = await db
    .select()
    .from(signOffCorrections)
    .where(eq(signOffCorrections.companyId, companyId));

  return {
    ...row,
    roster,
    signatures: sigs,
    corrections: corrections.filter((c) => sigs.some((s) => s.id === c.signOffId)),
  };
}

export type SignOffWithEmployee = SignOff & { employeeName: string };
