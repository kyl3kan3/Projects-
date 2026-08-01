/**
 * The one endpoint that takes a signature.
 *
 * QR, emailed link and kiosk all post here, which is deliberate: there is a
 * single place where evidence is captured, a single set of age checks, and a
 * single idempotency rule. The kiosk's offline outbox replays exactly this
 * payload on reconnect, so a signature captured with no network is the same
 * record as one taken online — including its `offlineKey`, which is what makes
 * the replay safe.
 *
 * Nothing here consults billing. Over-cap accounts sign normally.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getKioskSession } from "@/lib/auth";
import { resolveSignToken, versionById } from "@/lib/qr";
import { captureSigning, normalizeEmail, SigningError } from "@/lib/signatures";
import { MinorRuleError } from "@/lib/minors";
import { receiptEmail, send } from "@/lib/email";
import { stampDate } from "@/lib/signatures";
import { env } from "@/lib/env";

const person = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dob: z.string().max(10),
  email: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  relationship: z.string().max(60).optional(),
  answers: z.record(z.string().max(2000)).optional(),
});

const body = z.object({
  token: z.string().min(4).max(400),
  /** Kiosk sessions pin a version id so a mid-shift publish cannot swap the text. */
  versionId: z.string().uuid().optional(),
  channel: z.enum(["qr", "kiosk", "link"]),
  signer: person,
  minors: z.array(person).max(12).optional(),
  answers: z.record(z.string().max(2000)),
  initials: z.record(z.string().max(8)),
  signatureKind: z.enum(["typed", "drawn"]),
  signatureData: z.string().min(1).max(60_000),
  disclosureAccepted: z.boolean(),
  offlineKey: z.string().min(8).max(80).optional(),
  capturedAt: z.string().datetime().optional(),
});

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request): Promise<Response> {
  let parsed: z.infer<typeof body>;
  try {
    parsed = body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "That form did not arrive intact. Reload the page and try again.", detail: String(err) },
      { status: 400 },
    );
  }

  const resolved = await resolveSignToken(parsed.token);
  if (resolved.kind !== "ok") {
    return NextResponse.json(
      {
        error:
          resolved.kind === "expired"
            ? "That link has expired. Ask the front desk for a new one."
            : resolved.kind === "no_live_waiver"
              ? "There is no waiver published for this location yet."
              : "That code is no longer in use. Ask the front desk for a new one.",
      },
      { status: 410 },
    );
  }

  // A kiosk submission must come from a tablet that entered the PIN.
  if (parsed.channel === "kiosk") {
    const kiosk = await getKioskSession(resolved.location.id);
    if (!kiosk) {
      return NextResponse.json(
        { error: "This kiosk session has ended. Ask a member of staff to unlock it." },
        { status: 401 },
      );
    }
  }

  // The version the signer actually read. For an offline kiosk replay this can
  // be an older version than the current one, and that is exactly right: the
  // signature must pin what was on the screen, not what is live now.
  let version = resolved.version;
  if (parsed.versionId && parsed.versionId !== version.id) {
    const pinned = await versionById(parsed.versionId);
    if (pinned && pinned.accountId === resolved.location.accountId) version = pinned;
  }

  try {
    const result = await captureSigning({
      accountId: resolved.location.accountId,
      locationId: resolved.location.id,
      timeZone: resolved.location.timezone,
      version,
      channel: parsed.channel,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
      signer: parsed.signer,
      minors: parsed.minors,
      answers: parsed.answers,
      initials: parsed.initials,
      signatureKind: parsed.signatureKind,
      signatureData: parsed.signatureData,
      disclosureAccepted: parsed.disclosureAccepted,
      offlineKey: parsed.offlineKey,
      capturedAt: parsed.capturedAt ? new Date(parsed.capturedAt) : null,
    });

    // The receipt is best-effort by design: the record is already searchable.
    const to = normalizeEmail(parsed.signer.email);
    if (to && !result.deduped) {
      const names = parsed.minors?.length
        ? parsed.minors.map((m) => `${m.firstName} ${m.lastName}`)
        : [`${parsed.signer.firstName} ${parsed.signer.lastName}`];
      const first = result.signatureIds[0];
      await send(
        receiptEmail({
          to,
          signerName: `${parsed.signer.firstName} ${parsed.signer.lastName}`,
          venueName: resolved.location.name,
          waiverTitle: version.title,
          waiverVersion: version.version,
          participantNames: names,
          signedAtLabel: stampDate(new Date(), resolved.location.timezone),
          textHash: version.textHash,
          pdfUrl: `${env.appUrl}/api/signatures/${first}/pdf?receipt=1`,
        }),
      ).catch((err) => console.error("[sign] receipt failed", err));
    }

    return NextResponse.json({
      ok: true,
      deduped: result.deduped,
      signatureIds: result.signatureIds,
      participantIds: result.participantIds,
      names: parsed.minors?.length
        ? parsed.minors.map((m) => m.firstName)
        : [parsed.signer.firstName],
    });
  } catch (err) {
    if (err instanceof MinorRuleError || err instanceof SigningError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[sign] capture failed", err);
    return NextResponse.json(
      { error: "Something went wrong saving that. Ask the front desk — nothing was lost." },
      { status: 500 },
    );
  }
}
