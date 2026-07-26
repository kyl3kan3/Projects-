# Build Brief — SplitKit

**Status:** SCAFFOLD — nothing is implemented yet. Docs and stubs only.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here. Every file under
`app/` and `src/` is a stub (header comment + TODO list); the documents in this
folder are the binding spec for turning those stubs into the product.

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — stack, data model, the hash-chain design, services, and
   how the pieces talk. The manifest (`app.json` / `package.json`) is the source
   of truth for the framework and dependencies — build on exactly that stack.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes, type
   roles with sizes, spacing steps, component construction, the one signature
   detail (the record seal), and motion rules. Deviations are build failures.
4. **ROADMAP.md** — build Phase 1 (MVP) only, in its order.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — colors are exactly the custom-mixed values in DESIGN.md. The
  identity is "Ledger": bone paper, graphite ink, one oxblood accent. The
  oxblood is a recorded-mark, not a danger color — never use it for errors.
- **No emoji in product UI.** Icons are a single consistent SVG set
  (20×20 viewBox, 1.75px stroke).
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with paper text on light grounds; paper fill with ink text on dark.
- **One accent (oxblood), rationed to ≤10% of any screen.** It marks what has
  been *recorded* — seals, hash lines, redline rules, active states. `verdigris`
  carries meaning only (resolved / secured / done).
- **Mobile-first at 390px.** This is a native Expo app; 390×844 is the spec.
- **Fonts must actually load** (self-hosted Source Serif 4, Inter,
  JetBrains Mono via expo-font) — a silent system-font fallback is a failed build.
- **Real content everywhere** — the bundled ~60-task checklist, 50-state data,
  rebuild plan, and 20 education cards; plausible seeded demo data in every
  screenshotable state; no lorem, no placeholder bars.
- **Space before boxes; hairlines, not borders; 4px scale; three radii
  (6/12/20)** — per DESIGN_LANGUAGE.md.
- **The legal-adjacent line is a hard boundary:** checklist, inventory, vault,
  log, arithmetic, educate — the app never gives legal or financial advice,
  never characterizes property ("this is marital"), never recommends a
  settlement position, never says "admissible." Worksheets carry the
  attorney/CDFA footer verbatim; state content states facts and cites official
  sources. Review every template against the copy rules in README Risk #1–2.
- **The tamper-evidence claim is exact:** the hash chain proves entries were
  not altered *after* sealing; it does not prove truth or timing of the
  underlying events, and the export says so in plain language. Overclaiming is
  a build failure.
- **The privacy promise is architectural:** mandatory app lock before first
  data entry, no accounts, no analytics SDKs, no network calls except store
  billing and RevenueCat. Notification content on the lock screen is generic
  ("SplitKit reminder"), never revealing. Adding any other network dependency
  is a build failure.
- **.env.example placeholders only** — descriptive values; never real keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting.
2. Design tokens + global styles from DESIGN.md **before any screen** — type
   roles, spacing, both color modes, the icon set, rows/cards/buttons, and the
   record-seal keyframes.
3. SQLite schema, repositories, and the hash-chain module per ARCHITECTURE.md
   (run the Week-1 hash-chain + vault-capture spike first — sealing, chain
   verification, photo capture with SHA-256, and the app lock are the risk).
4. Bundled content as typed data: checklist tasks, 50-state facts, rebuild
   plan, education cards — with the non-advice copy review.
5. Product screens in ROADMAP Phase-1 order (Checklist → Inventory/Vault →
   Log + seal + PDF export → Scenarios → Onboarding/Lock/Paywall → Settings),
   wiring real flows end to end — no mocked handlers left behind.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   shoebox — the screenshot folder, the memory of what he said, the "do you
   have that in writing?" panic — and the two-party apps that need his
   cooperation), show the product running within 5 seconds (an entry being
   sealed into the record), this app's one device (**"the record they can't
   argue with"** — the seal stamping timestamp + hash onto an entry), honest
   receipts (never fabricated), one CTA phrase repeated verbatim.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- Typecheck, lint, and production build are green (`npm run typecheck &&
  npm run lint && npm run build:check`), with zero console errors.
- Every screen matches DESIGN.md at 390px in both color modes, including
  empty, loading, and error states; `prefers-reduced-motion` collapses the
  record seal to a fade.
- Airplane-mode test passes: every feature except purchase works offline.
- The hash chain verifies: seal 50 entries, verify the chain, alter one row in
  the DB directly, and confirm verification reports the break; the PDF export's
  digest matches an independent recomputation.
- App lock passes: backgrounding locks the app; no data screen is reachable
  before authentication; lock-screen notifications reveal nothing.
- The legal-adjacent checklist passes on all worksheet footers, state content,
  checklist copy, and education cards: no advice, no property characterization,
  no "admissible," citations present on every education card.
