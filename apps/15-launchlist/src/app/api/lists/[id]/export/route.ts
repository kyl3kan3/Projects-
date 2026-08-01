/**
 * CSV export. Owner-only, and available on every plan including free — the list
 * belongs to the founder, and holding it hostage is the behaviour we are
 * competing against.
 */

import { requireUser } from "@/lib/auth";
import { ownedList } from "@/lib/lists";
import { allSignups, creditedCountsFor, signupById } from "@/lib/signups";
import { SIGNUP_EXPORT_HEADER, exportFilename, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) return new Response("not found", { status: 404 });

  const rows = await allSignups(list.id);
  const referrals = await creditedCountsFor(rows.map((r) => r.id));

  // Map referrer ids to their codes so the export shows the referral graph in
  // terms a spreadsheet can follow, not internal UUIDs.
  const codeById = new Map(rows.map((r) => [r.id, r.referralCode]));
  for (const row of rows) {
    if (row.referredBySignupId && !codeById.has(row.referredBySignupId)) {
      const referrer = await signupById(row.referredBySignupId);
      if (referrer) codeById.set(referrer.id, referrer.referralCode);
    }
  }

  const csv = toCsv(
    SIGNUP_EXPORT_HEADER,
    rows.map((row) => [
      row.email,
      row.position > 0 ? row.position : "",
      row.joinRank,
      row.status,
      row.referralCode,
      row.referredBySignupId ? codeById.get(row.referredBySignupId) ?? "" : "",
      referrals.get(row.id) ?? 0,
      row.boostPoints,
      row.source,
      row.fraudScore,
      row.verifiedAt?.toISOString() ?? "",
      row.createdAt.toISOString(),
    ]),
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(list.slug)}"`,
      "cache-control": "no-store",
    },
  });
}
