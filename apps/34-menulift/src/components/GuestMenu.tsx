/**
 * The guest menu.
 *
 * A server component with **no client JavaScript at all** — the whole thing is
 * static HTML and CSS. That is not minimalism for its own sake: it is the reason
 * the page wins the race against every competitor's demo on a dim dining room's
 * wifi, and it means the menu works with JS disabled, which DESIGN.md requires.
 *
 * Escaping: every string here (dish names, descriptions, section notes, the
 * restaurant name) is owner-supplied text rendered as a JSX child, so React
 * escapes it. Nothing on this page uses `dangerouslySetInnerHTML`, and the one
 * place raw markup *is* generated for a guest — the QR SVG — is built from a URL
 * we construct, never from user text.
 */

import Link from "next/link";
import { money } from "@/lib/format";
import { DIETARY_TAG_LABELS, type DietaryTag } from "@/lib/dietary";
import type { PublicMenuPayload, ResolvedMenuView } from "@/lib/menu-data";

function DietaryTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          className="tag"
          title={DIETARY_TAG_LABELS[tag as DietaryTag] ?? tag}
          style={{ marginLeft: 8, verticalAlign: "2px" }}
        >
          {tag}
        </span>
      ))}
    </>
  );
}

export function GuestMenu({ view }: { view: ResolvedMenuView }) {
  const { payload, active, outsideServiceHours } = view;
  return (
    <main className="world-paper" style={{ minHeight: "100dvh" }}>
      <div className="guest-column screen" style={{ paddingBottom: 56 }}>
        <header style={{ paddingTop: 40, paddingBottom: 24 }}>
          <h1 className="t-display" style={{ margin: 0 }}>
            {payload.location.name}
          </h1>
          {payload.location.address ? (
            <p className="t-secondary" style={{ marginTop: 8 }}>
              {payload.location.address}
            </p>
          ) : null}
        </header>

        {payload.menus.length > 1 ? (
          <nav className="chip-row" aria-label="Menus" style={{ marginBottom: 24 }}>
            {payload.menus.map((menu) => (
              <Link
                key={menu.id}
                href={`/m/${payload.location.slug}/${menu.key}`}
                className={`chip${menu.id === active?.id ? " chip-active" : ""}`}
                aria-current={menu.id === active?.id ? "page" : undefined}
              >
                {menu.name}
              </Link>
            ))}
          </nav>
        ) : null}

        {!active ? (
          <section className="hairline-t" style={{ paddingTop: 24 }}>
            <p className="t-body-guest">
              This menu isn&apos;t published yet. Ask your server for tonight&apos;s list — the
              kitchen is open, the QR code just got here first.
            </p>
          </section>
        ) : (
          <>
            {outsideServiceHours && active.daypartLabel ? (
              <p className="t-secondary hairline-t" style={{ paddingTop: 16, marginBottom: 8 }}>
                {active.name} is served {active.daypartLabel}. Here it is anyway.
              </p>
            ) : null}

            {active.sections.length === 0 ? (
              <section className="hairline-t" style={{ paddingTop: 24 }}>
                <p className="t-body-guest">Nothing on {active.name} yet.</p>
              </section>
            ) : (
              active.sections.map((section) => (
                <section key={section.id} style={{ marginTop: 32 }}>
                  <h2 className="t-label" style={{ margin: 0 }}>
                    {section.name}
                  </h2>
                  {section.note ? (
                    <p className="t-secondary" style={{ marginTop: 8 }}>
                      {section.note}
                    </p>
                  ) : null}

                  <ul
                    className="hairline-t"
                    style={{ listStyle: "none", margin: 0, marginTop: 12, padding: 0 }}
                  >
                    {section.items.map((item) => (
                      <li
                        key={item.id}
                        className={`row${item.isEightySixed ? " is-86 row-86" : ""}`}
                      >
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.photoUrl}
                            alt=""
                            width={64}
                            height={64}
                            loading="lazy"
                            decoding="async"
                            className="photo"
                            style={{ width: 64, height: 64, flex: "0 0 auto" }}
                          />
                        ) : null}

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p className="t-dish" style={{ margin: 0 }}>
                            <span className="dish-name">{item.name}</span>
                            <DietaryTags tags={item.dietaryTags} />
                          </p>
                          {item.description ? (
                            <p
                              className="t-secondary clamp-2"
                              style={{ marginTop: 4, marginBottom: 0 }}
                            >
                              {item.description}
                            </p>
                          ) : null}
                          {item.isEightySixed ? (
                            <p
                              className="t-data"
                              style={{ marginTop: 6, marginBottom: 0, color: "#c05a3e" }}
                            >
                              {item.eightySixNote ? item.eightySixNote : "86'd tonight"}
                            </p>
                          ) : null}
                        </div>

                        <p className="row-price t-data" style={{ margin: 0 }}>
                          {money(item.priceCents, payload.location.currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}

        <footer className="hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
          <p className="t-secondary" style={{ margin: 0 }}>
            Prices include tax where applicable. Items marked 86&apos;d have run out tonight and
            come back tomorrow.
          </p>
        </footer>
      </div>
    </main>
  );
}

/** Shared metadata builder for both guest routes. */
export function guestMetadata(payload: PublicMenuPayload, menuName?: string) {
  const title = menuName
    ? `${menuName} — ${payload.location.name}`
    : `${payload.location.name} — menu`;
  return {
    title,
    description: `The live menu for ${payload.location.name}. Prices and availability are current${
      payload.location.address ? `; ${payload.location.address}` : ""
    }.`,
    robots: { index: true },
  };
}
