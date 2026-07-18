# Build Brief — StimTrack

**Status:** SCAFFOLD — nothing is implemented yet. Docs and stubs only.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here. The `app/` and
`src/` trees are stubs — header comments and TODO lists that mirror the intended
structure; every stub is an agreed starting point, not working code.

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — stack, data model, services, and how the pieces talk.
   The manifest (`app.json` / `package.json`) is the source of truth for the
   framework and dependencies — build on exactly that stack.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes, type
   roles with sizes, spacing steps, component construction, the one signature
   detail (the trigger-shot countdown), and motion rules. Deviations are build
   failures.
4. **ROADMAP.md** — build Phase 1 (MVP) only, in its order. The Week-1
   trigger-ladder spike gates everything else.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **Reliability is the product.** Local-first SQLite, offline-always: every
  feature except purchase works in airplane mode. No accounts, no sync service,
  no analytics SDKs, no crash reporters that exfiltrate content. The only
  network traffic is store billing and RevenueCat receipt validation. Adding
  any other network dependency is a build failure.
- **The trigger ladder is sacred.** The escalation schedule in ARCHITECTURE.md
  flow 3 (T−24h → T−0 → repeating nag until confirmed) is pre-registered as
  local notifications, survives the app being killed, always wins the iOS
  notification budget, and ignores quiet hours. The confirm-loop requires an
  explicit press-and-hold. If the Week-1 spike can't prove this on physical
  devices, stop and redesign before building anything else.
- **The wellness line is architectural:** the app never computes, suggests, or
  adjusts protocols, doses, or timings — every schedule and every trigger time
  is user-entered from clinic instructions, and the UI says "as instructed by
  your clinic." Reference cards educate with citations; they never instruct.
  No outcome predictions anywhere.
- **Loss-aware behavior is never paywalled and never wrong.** "End this cycle"
  is always reachable, silences every pending notification in one transaction,
  switches to the neutral register (no accent, no signal, no motion on ended
  surfaces), keeps data unless explicitly deleted, and never re-engages an
  ended cycle. A cheerful notification after a loss is the worst bug this
  product can ship; test the silence path as hard as the happy path.
- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md: one
  `viridian` accent rationed to ≤10% of any screen, plus `signal` for
  time-criticality ONLY (trigger, overdue). `signal` outside a criticality
  context is a build failure.
- **No emoji in product UI.** Icons are the single SVG set in DESIGN.md
  (20×20 viewBox, 1.75px stroke).
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with paper text on light grounds; off-white fill with ink text on dark.
- **Every clinical number is JetBrains Mono with tabular figures** — doses, E2
  values, follicle sizes, dates, countdown digits. A proportional-figure lab
  value is a build failure.
- **Mobile-first at 390px.** This is a native Expo app; 390×844 is the spec.
  Both color modes ship (light "Porcelain lab" is primary; dark "graphite
  lab-at-night" is fully specified).
- **Fonts must actually load** (self-hosted Archivo, Inter, JetBrains Mono via
  expo-font per `assets/fonts/README.md`) — a silent system-font fallback is a
  failed build.
- **Real content everywhere** — the bundled fertility-med library and reference
  cards, plausible seeded demo data in every screenshotable state (a believable
  day-9 stim cycle), no lorem, no placeholder bars.
- **Space before boxes; hairlines, not borders; 4px scale; three radii
  (8/12/20)** — per DESIGN_LANGUAGE.md.
- **.env.example placeholders only** — descriptive values; never real keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting.
2. **Week-1 spike (go/no-go):** the trigger ladder — pre-registered escalating
   local notifications with a confirm action writing to SQLite, app killed,
   on ≥2 physical iOS devices. Also validate the 64-pending budget with a
   realistic 4-med protocol scheduled alongside the ladder.
3. Design tokens + global styles from DESIGN.md **before any screen** — type
   roles, spacing, both color modes, the icon set, rows/cards/buttons, and the
   countdown construction.
4. SQLite schema, repositories, the reminder engine (budgeted scheduling +
   re-registration), and the loss-state engine per ARCHITECTURE.md.
5. Product screens in ROADMAP Phase-1 order (Calendar → Meds/reminders →
   Trigger countdown → Today → Labs/scans → Storage → Summary PDF →
   Onboarding/Paywall → Settings), wiring real flows end to end — no mocked
   handlers left behind.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the app
   that loses your data mid-cycle and the category that keeps congratulating
   you after a loss), show the product running within 5 seconds (the countdown
   ticking), this app's one device (**"the $20,000 reminder"** — the trigger
   shot that cannot be missed), honest receipts (never fabricated), one CTA
   phrase repeated verbatim.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- Typecheck, lint, and production build are green (`npm run typecheck &&
  npm run lint && npm run build:check`), with zero console errors.
- Every screen matches DESIGN.md at 390px in both color modes, including
  empty, loading, error, and **ended-cycle** states; `prefers-reduced-motion`
  collapses the countdown to static minute-refresh text.
- Airplane-mode test passes: every feature except purchase works offline.
- Trigger-ladder test passes on 3 physical devices with the app killed:
  every rung fires, the nag repeats until confirmed, confirmation silences it,
  and quiet hours never suppress it.
- Loss-state test passes: ending a cycle cancels 100% of its pending
  notifications (verified against the OS pending list), archived surfaces
  render in the neutral register, and no later notification references the
  ended cycle.
- The wellness-line checklist passes on all copy: no protocol generation, no
  dosing advice, no predictions; reference cards cite sources.
