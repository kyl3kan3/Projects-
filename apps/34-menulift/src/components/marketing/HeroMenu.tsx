/**
 * The hero: a real guest menu, at phone width, with the 86 already drawn.
 *
 * This is the product's actual output — the same row construction, type, and
 * hairlines as `GuestMenu` — not a screenshot and not a mockup. It is labelled a
 * demo, and the restaurant is fictional (MARKETING_PLAYBOOK law 5: stage honest
 * receipts, never fabricate a customer).
 *
 * Server component, zero client JS. The one animated beat is CSS: the
 * strikethrough draws itself once on load, which is the signature detail doing
 * the selling.
 */

import { money } from "@/lib/format";

interface DemoItem {
  name: string;
  description: string;
  priceCents: number;
  tags?: string[];
  eightySixed?: boolean;
}

const SECTIONS: { name: string; items: DemoItem[] }[] = [
  {
    name: "Starters",
    items: [
      { name: "Burrata", description: "grilled peach, basil, sourdough", priceCents: 1600, tags: ["V"] },
      { name: "Charred Broccolini", description: "anchovy butter, lemon, breadcrumb", priceCents: 1200, tags: ["DF"] },
    ],
  },
  {
    name: "Mains",
    items: [
      { name: "Crispy Half Chicken", description: "chili honey, pickled fennel", priceCents: 2400, tags: ["GF"] },
      {
        name: "Grilled Swordfish",
        description: "salsa verde, charred lemon, white beans",
        priceCents: 3200,
        tags: ["GF"],
        eightySixed: true,
      },
      { name: "Cacio e Pepe", description: "hand-cut tonnarelli, pecorino, black pepper", priceCents: 2100, tags: ["V"] },
    ],
  },
];

export function HeroMenu() {
  return (
    <div
      className="world-paper sheet"
      style={{ padding: "24px 20px", maxWidth: 360, width: "100%" }}
      aria-label="A live guest menu, shown as a demo"
    >
      <p className="t-label" style={{ margin: 0 }}>
        Demo · Rossi &amp; Co
      </p>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 30,
          lineHeight: 1.1,
          margin: "8px 0 20px",
        }}
      >
        Dinner
      </p>

      {SECTIONS.map((section) => (
        <section key={section.name} style={{ marginTop: 20 }}>
          <p className="t-label" style={{ margin: 0 }}>
            {section.name}
          </p>
          <ul className="hairline-t" style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
            {section.items.map((item) => (
              <li
                key={item.name}
                className={`row${item.eightySixed ? " is-86 row-86 sweep-in" : ""}`}
                style={{ paddingTop: 12, paddingBottom: 12 }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="t-dish" style={{ margin: 0 }}>
                    <span className="dish-name">{item.name}</span>
                    {item.tags?.map((tag) => (
                      <span key={tag} className="tag" style={{ marginLeft: 8, verticalAlign: "2px" }}>
                        {tag}
                      </span>
                    ))}
                  </p>
                  <p className="t-secondary" style={{ margin: "2px 0 0" }}>
                    {item.description}
                  </p>
                  {item.eightySixed ? (
                    <p className="t-data" style={{ margin: "6px 0 0", color: "#c05a3e" }}>
                      86&apos;d tonight
                    </p>
                  ) : null}
                </div>
                <p className="row-price t-data" style={{ margin: 0 }}>
                  {money(item.priceCents)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
