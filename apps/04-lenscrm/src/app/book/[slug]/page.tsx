import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSlots } from "@/lib/booking";
import { BookingFlow } from "@/components/BookingFlow";
import { fmtDuration } from "@/lib/format";
import { Aperture } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Public booking page (paper ground). Slug is account slug; shows the first
 *  active booking type. Real app lets the visitor choose among types. */
export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.slug, slug) });
  if (!account) notFound();
  const bt = await db.query.bookingTypes.findFirst({ where: and(eq(schema.bookingTypes.accountId, account.id), eq(schema.bookingTypes.isActive, true)) });
  if (!bt) notFound();

  const from = new Date();
  const to = new Date(Date.now() + 28 * 86400_000);
  const slots = await openSlots({ accountId: account.id, bookingTypeId: bt.id, from, to });

  return (
    <main className="paper-ground min-h-screen">
      <div className="mx-auto max-w-md px-5 py-12">
        <div className="flex flex-col items-center gap-2 text-center">
          <Aperture size={24} stroke="#1b1b19" />
          <span className="font-semibold" style={{ color: "#1b1b19" }}>{account.name}</span>
        </div>
        <h1 className="t-display mt-6 text-center" style={{ fontSize: "clamp(24px, 7vw, 34px)", color: "#1b1b19" }}>{bt.name}</h1>
        <p className="mt-1 text-center text-[13px]" style={{ color: "#6b6a63" }}>{fmtDuration(bt.durationMinutes * 60)} · pick a time below</p>
        <div className="mt-8">
          <BookingFlow bookingTypeId={bt.id} slots={slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }))} priceCents={bt.priceCents} depositPercent={bt.depositPercent} />
        </div>
      </div>
    </main>
  );
}
