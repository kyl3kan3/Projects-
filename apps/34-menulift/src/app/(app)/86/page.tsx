import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Board, type BoardRow } from "@/components/Board";
import { loadBoardItems } from "@/lib/menus";
import { tonightCount, tonightLog } from "@/lib/eighty-six";
import { serviceTime } from "@/lib/format";

export const metadata: Metadata = { title: "86 board" };

/**
 * The owner's view of the board. Identical component to the PIN board at
 * /board/[slug] — one implementation, two doors, so the thing that gets used at
 * the pass is the thing that gets tested.
 */
export default async function EightySixPage() {
  const { location } = await requireUser();
  const [items, count, log] = await Promise.all([
    loadBoardItems(location.id),
    tonightCount(location.id),
    tonightLog(location.id),
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
    <main className="screen" style={{ paddingTop: 24 }}>
      <p className="t-label" style={{ margin: 0, marginBottom: 16 }}>
        {location.name} · tonight
      </p>

      <Board rows={rows} tonightCount={count} slug={location.slug} />

      {log.length ? (
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            Tonight&apos;s log
          </h2>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {log.map((entry) => (
              <li key={entry.id} className="hairline-b" style={{ paddingTop: 12, paddingBottom: 12 }}>
                <p className="t-body" style={{ margin: 0 }}>
                  {entry.itemName}
                </p>
                <p className="t-data" style={{ margin: 0, marginTop: 2, color: "var(--fg-2)" }}>
                  86&apos;d {serviceTime(entry.eightySixedAt, location.timezone)} by {entry.actorLabel}
                  {entry.restoredAt
                    ? ` · back ${serviceTime(entry.restoredAt, location.timezone)}${
                        entry.restoreMode === "nightly_auto" ? " automatically" : ""
                      }`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
        <h2 className="t-label" style={{ margin: 0 }}>
          The board at the pass
        </h2>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {location.staffPin
            ? `Staff can open /board/${location.slug} and enter the PIN — no account, no password, and they cannot see prices or margins.`
            : "Set a staff PIN and the line can 86 a dish from their own phone without an account."}
        </p>
        <Link href="/settings" className="btn-quiet">
          {location.staffPin ? "Change the staff PIN" : "Set a staff PIN"}
        </Link>
      </section>
    </main>
  );
}
