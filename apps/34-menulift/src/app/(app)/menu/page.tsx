import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadEditorMenus } from "@/lib/menus";
import { MenuEditor, type MenuView } from "./Editor";
import { NewMenuForm } from "./NewMenuForm";
import { env } from "@/lib/env";
import { featureAllowed, planRequiredFor } from "@/lib/plans";
import { IconHistory, IconQr, IconSettings } from "@/components/icons";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  const { organization, location } = await requireUser();
  const menus = await loadEditorMenus(location.id);
  const canHaveMultiple = featureAllowed(organization.plan, "multipleMenus");

  const views: MenuView[] = menus.map((menu) => ({
    id: menu.id,
    name: menu.name,
    status: menu.status,
    daypartStart: menu.daypart?.start ?? "",
    daypartEnd: menu.daypart?.end ?? "",
    daypartDays: menu.daypart?.days ?? [],
    publishedAt: menu.publishedAt?.toISOString() ?? null,
    sections: menu.sections.map((section) => ({
      id: section.id,
      name: section.name,
      note: section.note,
      items: section.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        costCents: item.costCents,
        dietaryTags: item.dietaryTags ?? [],
        isEightySixed: item.isEightySixed,
        autoRestore: item.autoRestore,
        photoStatus: item.photoStatus,
      })),
    })),
  }));

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <p className="t-label" style={{ margin: 0 }}>
          {location.name}
        </p>
        <h1 className="t-h2" style={{ marginTop: 8, marginBottom: 12 }}>
          Menu
        </h1>
        <nav className="chip-row" aria-label="Menu tools">
          <Link href="/qr" className="chip">
            <IconQr size={18} /> <span style={{ marginLeft: 8 }}>QR &amp; print</span>
          </Link>
          <Link href="/history" className="chip">
            <IconHistory size={18} /> <span style={{ marginLeft: 8 }}>History</span>
          </Link>
          <Link href="/settings" className="chip">
            <IconSettings size={18} /> <span style={{ marginLeft: 8 }}>Settings</span>
          </Link>
        </nav>
      </header>

      {views.length === 0 ? (
        <section className="hairline-t" style={{ paddingTop: 24 }}>
          <h2 className="t-dish" style={{ marginTop: 0 }}>
            Start with the menu you already print
          </h2>
          <p className="t-secondary" style={{ marginBottom: 24 }}>
            One menu, a few sections, the dishes as they read on paper. You can publish it in five
            minutes and fix the wording later — nothing goes to a guest until you press publish.
          </p>
          <NewMenuForm />
        </section>
      ) : (
        <div style={{ display: "grid", gap: 56 }}>
          {views.map((menu) => (
            <MenuEditor
              key={menu.id}
              menu={menu}
              publicUrl={`${env.appUrl}/m/${location.slug}`}
            />
          ))}
        </div>
      )}

      {views.length > 0 ? (
        <section className="hairline-t" style={{ marginTop: 56, paddingTop: 24 }}>
          {canHaveMultiple ? (
            <>
              <h2 className="t-label" style={{ marginTop: 0 }}>
                Another menu
              </h2>
              <p className="t-secondary" style={{ marginBottom: 16 }}>
                Brunch, drinks, a happy-hour list. Each one gets its own daypart and its own chip on
                the guest page.
              </p>
              <NewMenuForm />
            </>
          ) : (
            <p className="t-secondary" style={{ margin: 0 }}>
              Multiple menus — brunch, drinks, dayparts — are on{" "}
              {planRequiredFor("multipleMenus").name}.{" "}
              <Link href="/settings/billing" style={{ color: "#c05a3e" }}>
                See plans
              </Link>
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}
