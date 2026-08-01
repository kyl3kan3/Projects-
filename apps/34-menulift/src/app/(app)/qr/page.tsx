import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { menus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PRINT_SIZES, menuUrl, qrSvg } from "@/lib/qr";
import { loadPublicMenuFresh } from "@/lib/menu-data";
import { IconPrinter } from "@/components/icons";
import { CopyField } from "@/components/CopyField";

export const metadata: Metadata = { title: "QR & print" };

export default async function QrPage() {
  const { location } = await requireUser();
  const db = getDb();
  const liveMenus = await db
    .select()
    .from(menus)
    .where(eq(menus.locationId, location.id))
    .orderBy(asc(menus.position));
  const payload = await loadPublicMenuFresh(location.slug);

  const url = menuUrl(location.slug);
  const svg = qrSvg(url, { sizePx: 240, margin: 4 });
  const anyLive = liveMenus.some((m) => m.status === "live");

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <h1 className="t-h2" style={{ marginTop: 0, marginBottom: 8 }}>
        QR &amp; print
      </h1>
      <p className="t-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
        One code for the whole location. It follows the clock, so a table tent printed today still
        shows brunch on Sunday morning.
      </p>

      {!anyLive ? (
        <p className="t-body" style={{ color: "#b8863b" }}>
          Nothing is published yet — this code works, but a guest scanning it will be told the menu
          isn&apos;t up. Publish a menu first.
        </p>
      ) : null}

      <section
        className="card"
        style={{ padding: 24, display: "grid", gap: 16, justifyItems: "center" }}
      >
        {/*
          The SVG is generated from a URL we build ourselves — never from
          owner-supplied text — so there is no user data inside this markup.
        */}
        <div
          style={{ width: 240, height: 240 }}
          dangerouslySetInnerHTML={{ __html: svg }}
          aria-hidden
        />
        <p className="t-label" style={{ margin: 0 }}>
          Scan for the menu
        </p>
      </section>

      <div style={{ marginTop: 24 }}>
        <CopyField label="Guest URL" value={url} />
      </div>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label" style={{ margin: 0, marginBottom: 12 }}>
          Print
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          <a
            className="btn btn-primary btn-block"
            href={`/api/print/${location.slug}?format=pack`}
            download={`${location.slug}-menulift-print-pack.pdf`}
          >
            <IconPrinter size={20} /> Table tent + window card (PDF)
          </a>
          <a
            className="btn btn-secondary btn-block"
            href={`/api/print/${location.slug}?format=table_tent`}
            download={`${location.slug}-table-tent.pdf`}
          >
            {PRINT_SIZES.table_tent.label}
          </a>
          <a
            className="btn btn-secondary btn-block"
            href={`/api/print/${location.slug}?format=window_card`}
            download={`${location.slug}-window-card.pdf`}
          >
            {PRINT_SIZES.window_card.label}
          </a>
          <a
            className="btn btn-secondary btn-block"
            href={`/api/print/${location.slug}?format=svg`}
            download={`${location.slug}-qr.svg`}
          >
            Raw QR (SVG, for a designer)
          </a>
        </div>
        <p className="t-secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Everything is vector with crop marks, so it stays sharp at any size a print shop asks for.
        </p>
      </section>

      {payload && payload.menus.length > 1 ? (
        <section style={{ marginTop: 40 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            One menu only
          </h2>
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 12 }}>
            For a bar card or a brunch-only tent, print a code that always opens one menu.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {payload.menus.map((menu) => (
              <li key={menu.id} className="row" style={{ alignItems: "center" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="t-body" style={{ margin: 0 }}>
                    {menu.name}
                  </p>
                  <p className="t-data" style={{ margin: 0, marginTop: 2, color: "var(--fg-3)" }}>
                    /m/{location.slug}/{menu.key}
                  </p>
                </div>
                <a
                  className="btn btn-secondary"
                  style={{ minHeight: 44 }}
                  href={`/api/print/${location.slug}?format=pack&menu=${menu.key}`}
                  download={`${location.slug}-${menu.key}-print-pack.pdf`}
                >
                  PDF
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
