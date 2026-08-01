import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations } from "@/db/schema";
import { getBoardSession, getSession } from "@/lib/auth";
import { Board, type BoardRow } from "@/components/Board";
import { loadBoardItems } from "@/lib/menus";
import { tonightCount } from "@/lib/eighty-six";
import { serviceTime } from "@/lib/format";
import { EndSession, PinForm } from "./PinForm";

export const metadata: Metadata = { title: "86 board", robots: { index: false } };

/**
 * The expo-station board: a PIN, then the same board component the owner sees.
 *
 * Dynamic, never cached — this page is the current state of service, and a cached
 * copy of it would be exactly the lie the product exists to prevent.
 */
export const dynamic = "force-dynamic";

export default async function StaffBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  const [location] = await db.select().from(locations).where(eq(locations.slug, slug));
  if (!location || !location.active) notFound();

  const board = await getBoardSession();
  const session = await getSession();
  const authorised = (board && board.locationId === location.id) || Boolean(session);

  if (!authorised) {
    return (
      <main className="screen" style={{ maxWidth: 420, margin: "0 auto", paddingTop: 56 }}>
        {location.staffPin ? (
          <PinForm slug={slug} locationName={location.name} />
        ) : (
          <>
            <p className="t-label">{location.name}</p>
            <h1 className="t-h2" style={{ marginTop: 8 }}>
              No station PIN set
            </h1>
            <p className="t-secondary">
              The owner needs to set a staff PIN in settings before this board can be opened from a
              phone at the pass.
            </p>
          </>
        )}
      </main>
    );
  }

  const [items, count] = await Promise.all([
    loadBoardItems(location.id),
    tonightCount(location.id),
  ]);

  const rows: BoardRow[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    sectionName: item.sectionName,
    menuName: item.menuName,
    priceCents: item.priceCents,
    isEightySixed: item.isEightySixed,
    eightySixNote: item.eightySixNote,
    autoRestore: item.autoRestore,
    eightySixedAtLabel: item.eightySixedAt
      ? serviceTime(item.eightySixedAt, location.timezone)
      : null,
    eightySixedBy: item.eightySixedBy,
  }));

  return (
    <main className="screen" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 24, paddingBottom: 56 }}>
      <p className="t-label" style={{ margin: 0, marginBottom: 16 }}>
        {location.name} · tonight
      </p>
      <Board rows={rows} tonightCount={count} slug={location.slug} standalone />
      <div style={{ marginTop: 24 }}>
        <EndSession slug={slug} />
      </div>
    </main>
  );
}
