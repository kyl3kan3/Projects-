/**
 * Gate codes.
 *
 * **No hardware integration in v1, stated honestly.** UnitKeeper issues, tracks
 * and revokes the code, and exports the whole facility as CSV for the keypad
 * system to import. It does not talk to a PTI or DoorKing controller, and the
 * export screen says so in a sentence rather than implying a sync happened.
 *
 * A code has three states and each one is a fact about access:
 *   active     — the tenant can open the gate
 *   overlocked — the ladder reached its overlock rung; the code is refused
 *   revoked    — the tenancy ended
 *
 * Codes are unique per facility, because two tenants with the same code makes the
 * gate log worthless the one time it matters.
 */

import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { facilities, tenancies, tenants, units } from "@/db/schema";
import { audit } from "@/lib/audit";

const CODE_LENGTH = 5;

/** Codes a burglar tries first, plus anything with fewer than three digits. */
function tooObvious(code: string): boolean {
  if (/^(\d)\1*$/.test(code)) return true;
  if ("0123456789".includes(code)) return true;
  if ("9876543210".includes(code)) return true;
  return new Set(code).size < 3;
}

function candidate(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/**
 * A code no live tenancy in this facility already holds. It gives up after a
 * bounded number of tries rather than spinning: at five digits and 400 units the
 * collision probability is tiny, and an owner seeing an error is better than a
 * request that never returns.
 */
export async function issueGateCode(facilityId: string): Promise<string> {
  const taken = new Set(await codesInUse(facilityId));
  for (let i = 0; i < 200; i += 1) {
    const code = candidate();
    if (tooObvious(code) || taken.has(code)) continue;
    return code;
  }
  throw new Error("Could not find an unused gate code — check the facility's unit count");
}

async function codesInUse(facilityId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ gateCode: tenancies.gateCode })
    .from(tenancies)
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .where(and(eq(units.facilityId, facilityId), ne(tenancies.gateCodeStatus, "revoked")));
  return rows.map((r) => r.gateCode).filter((c): c is string => Boolean(c));
}

export async function setGateCodeStatus(
  ownerId: string,
  actor: string,
  tenancyId: string,
  status: "active" | "revoked" | "overlocked",
): Promise<void> {
  await getDb()
    .update(tenancies)
    .set({ gateCodeStatus: status, updatedAt: new Date() })
    .where(eq(tenancies.id, tenancyId));
  await audit(ownerId, actor, `gate.${status}`, tenancyId);
}

/** Issue a fresh code on the same tenancy — used when a tenant loses theirs. */
export async function reissueGateCode(
  ownerId: string,
  actor: string,
  tenancyId: string,
  facilityId: string,
): Promise<string> {
  const code = await issueGateCode(facilityId);
  await getDb()
    .update(tenancies)
    .set({ gateCode: code, gateCodeStatus: "active", updatedAt: new Date() })
    .where(eq(tenancies.id, tenancyId));
  await audit(ownerId, actor, "gate.reissued", tenancyId, { code });
  return code;
}

/* ---------------------------------------------------------------- exports --- */

export interface GateRow {
  unitLabel: string;
  tenantName: string;
  code: string;
  status: string;
  /** 1 when the keypad should let them in, 0 when it should not. */
  enabled: 0 | 1;
}

export async function gateRowsFor(facilityId: string): Promise<GateRow[]> {
  const rows = await getDb()
    .select({
      unitLabel: units.label,
      tenantName: tenants.name,
      gateCode: tenancies.gateCode,
      gateCodeStatus: tenancies.gateCodeStatus,
    })
    .from(tenancies)
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .innerJoin(tenants, eq(tenancies.tenantId, tenants.id))
    .where(
      and(
        eq(units.facilityId, facilityId),
        isNull(tenancies.endedOn),
        inArray(tenancies.gateCodeStatus, ["active", "overlocked"]),
      ),
    )
    .orderBy(units.label);

  return rows
    .filter((r): r is typeof r & { gateCode: string } => Boolean(r.gateCode))
    .map((r) => ({
      unitLabel: r.unitLabel,
      tenantName: r.tenantName,
      code: r.gateCode,
      status: r.gateCodeStatus,
      enabled: r.gateCodeStatus === "active" ? 1 : 0,
    }));
}

export async function facilityOwnedBy(ownerId: string, facilityId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: facilities.id })
    .from(facilities)
    .where(and(eq(facilities.id, facilityId), eq(facilities.ownerId, ownerId)));
  return Boolean(row);
}
