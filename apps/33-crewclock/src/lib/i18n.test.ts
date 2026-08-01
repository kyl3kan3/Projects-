import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { en } from "@/i18n/en";
import { es } from "@/i18n/es";
import {
  LOCALES,
  formatClockTime,
  formatDayLabel,
  formatDecimalHours,
  formatMoney,
  formatShortDate,
  normalizeLocale,
  plural,
  t,
  translator,
} from "@/lib/i18n";

const CHICAGO = "America/Chicago";

describe("catalogue parity", () => {
  it("has both locales", () => {
    assert.deepEqual([...LOCALES], ["en", "es"]);
  });

  it("translates every English key into Spanish", () => {
    const missing = Object.keys(en).filter((key) => !(key in es));
    assert.deepEqual(missing, []);
  });

  it("has no Spanish keys the English catalogue does not define", () => {
    const extra = Object.keys(es).filter((key) => !(key in en));
    assert.deepEqual(extra, []);
  });

  it("leaves no string empty in either locale", () => {
    for (const [key, value] of Object.entries(en)) {
      assert.ok(value.trim().length > 0, `en.${key} is empty`);
    }
    for (const [key, value] of Object.entries(es)) {
      assert.ok(value.trim().length > 0, `es.${key} is empty`);
    }
  });

  it("uses the same placeholders in both locales", () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      assert.deepEqual(
        placeholders(es[key]),
        placeholders(en[key]),
        `placeholder mismatch on "${key}"`,
      );
    }
  });

  it("has not left an English string sitting in the Spanish catalogue", () => {
    // Product nouns and formats legitimately match across locales; anything
    // else being identical means a string was never translated.
    const allowed = new Set([
      "app.name",
      "export.format.adp",
      "export.format.gusto",
      "join.pinLabel",
      "fence.accuracy",
      "hours.entry",
      "review.period",
      "join.codePlaceholder",
      "billing.plan",
    ]);
    const identical = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => en[key] === es[key] && !allowed.has(key),
    );
    assert.deepEqual(identical, []);
  });

  it("really is Spanish on the crew-facing controls", () => {
    assert.equal(t("es", "clock.in"), "MARCAR ENTRADA");
    assert.equal(t("es", "clock.out"), "MARCAR SALIDA");
    assert.equal(t("es", "clock.onTheClock"), "EN TURNO");
    assert.equal(t("es", "clock.shift"), "Jornada");
  });

  it("carries the diacritics the fonts must render", () => {
    const joined = Object.values(es).join(" ");
    for (const glyph of ["á", "é", "í", "ó", "ú", "ñ", "¿", "¡"]) {
      assert.ok(joined.includes(glyph), `Spanish catalogue never uses ${glyph}`);
    }
  });
});

describe("interpolation", () => {
  it("substitutes named placeholders", () => {
    assert.equal(
      t("en", "clock.fence.outside", { meters: 142 }),
      "142 m from site — will be flagged",
    );
    assert.equal(
      t("es", "clock.fence.outside", { meters: 142 }),
      "A 142 m del sitio — se va a marcar",
    );
  });

  it("leaves an unsupplied placeholder visible rather than printing undefined", () => {
    assert.equal(t("en", "join.greeting"), "Hello, {name}.");
  });

  it("binds a locale once per screen", () => {
    const tt = translator("es");
    assert.equal(tt("nav.jobs"), "Trabajos");
  });

  it("picks the one/many form", () => {
    assert.equal(plural("en", 1, { one: "clock.queued.one", many: "clock.queued.many" }), "1 punch waiting to sync");
    assert.equal(
      plural("en", 3, { one: "clock.queued.one", many: "clock.queued.many" }),
      "3 punches waiting to sync",
    );
    assert.equal(
      plural("es", 3, { one: "clock.queued.one", many: "clock.queued.many" }),
      "3 marcas esperando sincronizar",
    );
  });
});

describe("locale resolution", () => {
  it("accepts the two we ship and falls back for the rest", () => {
    assert.equal(normalizeLocale("es"), "es");
    assert.equal(normalizeLocale("es-MX"), "es");
    assert.equal(normalizeLocale("en-GB"), "en");
    assert.equal(normalizeLocale("pt-BR"), "en");
    assert.equal(normalizeLocale(null), "en");
    assert.equal(normalizeLocale("pt-BR", "es"), "es");
  });
});

describe("locale formatting", () => {
  const instant = new Date("2026-02-24T13:03:00Z"); // 07:03 in Chicago

  it("labels the day the way each language writes it", () => {
    assert.equal(formatDayLabel(instant, CHICAGO, "en"), "Tue 24");
    assert.equal(formatDayLabel(instant, CHICAGO, "es"), "mar 24");
  });

  it("uses a 12-hour clock in English and a 24-hour clock in Spanish", () => {
    assert.equal(formatClockTime(instant, CHICAGO, "en"), "7:03 AM");
    assert.equal(formatClockTime(instant, CHICAGO, "es"), "07:03");
  });

  it("formats a short date in each language's order", () => {
    assert.equal(formatShortDate("2026-02-24", "en"), "Feb 24");
    assert.equal(formatShortDate("2026-02-24", "es"), "24 feb");
  });

  it("always shows two decimal places of hours", () => {
    assert.equal(formatDecimalHours(799, "en"), "7.99");
    // es-MX uses a period as the decimal separator, unlike es-ES — which is the
    // right call for the audience: US crews reading US payroll figures.
    assert.equal(formatDecimalHours(799, "es"), "7.99");
    assert.equal(formatDecimalHours(4000, "en"), "40.00");
  });

  it("keeps money in USD for both — the crews are American", () => {
    assert.equal(formatMoney(1_120_000, "en"), "$11,200");
    assert.equal(formatMoney(1_120_000, "es").includes("11"), true);
  });
});
