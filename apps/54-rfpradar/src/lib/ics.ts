/**
 * src/lib/ics.ts
 *
 * The deadline calendar feed. Every questions/proposal/orals date mirrors into a
 * per-firm ICS subscription that Google and Outlook poll on their own schedule.
 *
 * The URL carries a signed compact JWS (jose, HS256 over `ICS_TOKEN_SECRET`) and
 * the firm row stores only the token's sha256. Two consequences, both wanted:
 * a token can be verified without a database lookup of secrets, and rotation
 * kills the old URL instantly because its hash no longer matches. Rotation is
 * hold-to-confirm in the UI and always audit-logged — a stale calendar feed is
 * a security problem, not a convenience one.
 *
 * The VCALENDAR body is written by hand rather than generated: RFC 5545 wants
 * CRLF line endings, 75-octet line folding, and escaped commas and semicolons
 * in TEXT values, and a feed that Google silently refuses to parse is not a
 * feature anyone can debug from a screenshot.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, deadlines, firms, pursuits } from "@/db/schema";
import { env } from "@/lib/env";
import { deadlineKindLabel } from "@/lib/format";

const ISSUER = "rfpradar";
const AUDIENCE = "ics-feed";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.icsTokenSecret);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a feed token and store its hash on the firm. Any previously issued token
 * stops working the moment this returns — one live feed URL per firm.
 */
export async function mintIcsToken(firmId: string): Promise<string> {
  const token = await new SignJWT({ firmId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(createHash("sha256").update(`${firmId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16))
    .sign(secretKey());

  await getDb()
    .update(firms)
    .set({ icsTokenHash: hashToken(token), updatedAt: new Date() })
    .where(eq(firms.id, firmId));
  return token;
}

/**
 * Verify a feed token. Returns the firm id, or null for a signature failure, a
 * wrong issuer/audience, or a token that has been rotated away.
 */
export async function verifyIcsToken(token: string): Promise<string | null> {
  let firmId: string;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.firmId !== "string") return null;
    firmId = payload.firmId;
  } catch {
    return null;
  }

  const [firm] = await getDb().select().from(firms).where(eq(firms.id, firmId));
  if (!firm?.icsTokenHash) return null;

  const presented = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(firm.icsTokenHash, "hex");
  if (presented.length !== stored.length) return null;
  if (!timingSafeEqual(presented, stored)) return null;
  return firmId;
}

export async function rotateIcsToken(input: {
  firmId: string;
  actorUserId: string;
}): Promise<string> {
  const token = await mintIcsToken(input.firmId);
  await getDb().insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "ics.token_rotated",
    target: input.firmId,
    metadata: { at: new Date().toISOString() },
  });
  return token;
}

export function icsFeedUrl(token: string): string {
  return `${env.appUrl}/api/ics/${token}`;
}

/** Whether this firm currently has a live feed URL. */
export async function hasIcsToken(firmId: string): Promise<boolean> {
  const [firm] = await getDb().select().from(firms).where(eq(firms.id, firmId));
  return Boolean(firm?.icsTokenHash);
}

/* ------------------------------------------------------------ the VCALENDAR */

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line at 75 octets, continuation lines starting with a space. */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let offset = 0;
  let limit = 75;
  while (offset < bytes.length) {
    // Don't split a multi-byte character: walk back to a boundary.
    let end = Math.min(offset + limit, bytes.length);
    while (end > offset && end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) end -= 1;
    parts.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    limit = 74; // continuation lines lose one octet to the leading space
  }
  return parts.join("\r\n ");
}

function icsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export interface IcsEvent {
  uid: string;
  start: Date;
  /** Deadlines are moments, not spans; a 30-minute block reads well in a grid. */
  durationMinutes: number;
  summary: string;
  description: string;
  url: string;
  sequence: number;
}

export function renderCalendar(events: IcsEvent[], name: string, now: Date = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RFPRadar//Deadline feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(name)}`,
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ];

  for (const event of events) {
    const end = new Date(event.start.getTime() + event.durationMinutes * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART:${icsStamp(event.start)}`,
      `DTEND:${icsStamp(end)}`,
      `SEQUENCE:${event.sequence}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
      `URL:${escapeIcsText(event.url)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/**
 * One VEVENT per open deadline. Completed deadlines drop out of the feed, which
 * is how a calendar client learns the work is done.
 */
export async function renderIcsFeed(firmId: string, now: Date = new Date()): Promise<string> {
  const db = getDb();
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) return renderCalendar([], "RFPRadar deadlines", now);

  const rows = await db
    .select({ deadline: deadlines, pursuitTitle: pursuits.title, pursuitId: pursuits.id })
    .from(deadlines)
    .leftJoin(pursuits, eq(deadlines.pursuitId, pursuits.id))
    .where(eq(deadlines.firmId, firmId))
    .orderBy(deadlines.dueAt);

  const events: IcsEvent[] = rows
    .filter((row) => row.deadline.completedAt === null)
    .map((row) => ({
      uid: `${row.deadline.id}@rfpradar`,
      start: row.deadline.dueAt,
      durationMinutes: 30,
      summary: row.deadline.label,
      description: [
        deadlineKindLabel(row.deadline.kind),
        row.pursuitTitle ? `Pursuit: ${row.pursuitTitle}` : null,
        row.pursuitId ? `${env.appUrl}/pursuits/${row.pursuitId}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      url: row.pursuitId ? `${env.appUrl}/pursuits/${row.pursuitId}` : `${env.appUrl}/deadlines`,
      // Bumped by updatedAt so a moved date is treated as an update, not a
      // second event, by clients that honour SEQUENCE.
      sequence: Math.floor(row.deadline.updatedAt.getTime() / 60_000) % 1_000_000,
    }));

  return renderCalendar(events, `${firm.name} — RFPRadar deadlines`, now);
}
