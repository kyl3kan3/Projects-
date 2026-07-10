# Build Brief — MenoCompass

**Status:** IMPLEMENTED MVP — the screens, data layer, paywall, report engine, and landing page described here are built and verified (typecheck, lint, production export). Remaining work is device-dependent QA and the ROADMAP's post-MVP items; treat this brief as the binding spec for any further change.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here.

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — stack, data model, services, integrations, and how the
   pieces talk. The manifest (`app.json` / `package.json`) is the source of
   truth for the framework and dependencies — build on exactly that stack.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes, type
   roles with sizes, spacing steps, component construction, the one signature
   detail (the report render), and motion rules. Deviations are build failures.
4. **ROADMAP.md** — build Phase 1 (MVP) only, in its order.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md. This
  rule is doubly binding here: purple is the menopause-app cliché.
- **No emoji in product UI.** Icons are a single consistent SVG set
  (20×20 viewBox, 1.75px stroke).
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with paper text on light grounds; paper fill with ink text on dark.
- **One accent (ember), rationed to ≤10% of any screen.** `sage`/`claret`
  carry meaning only (taken/missed).
- **Mobile-first at 390px.** This is a native Expo app; 390×844 is the spec.
- **Fonts must actually load** (self-hosted Bricolage Grotesque, Inter,
  JetBrains Mono via expo-font) — a silent system-font fallback is a failed build.
- **Real content everywhere** — the bundled 34-symptom library, plausible
  seeded demo data in every screenshotable state, no lorem, no placeholder bars.
- **Space before boxes; hairlines, not borders; 4px scale; three radii
  (10/14/22)** — per DESIGN_LANGUAGE.md.
- **The wellness line is a hard boundary:** log, remind, correlate, educate —
  the app never diagnoses, never advises doses, never makes causal claims.
  Every insight uses the observational template in DESIGN.md/ARCHITECTURE.md
  with the "correlation, not causation" footer. Education cards cite sources.
- **The privacy promise is architectural:** no accounts, no analytics SDKs,
  no network calls except store billing and RevenueCat. Adding any other
  network dependency is a build failure.
- **.env.example placeholders only** — descriptive values; never real keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting.
2. Design tokens + global styles from DESIGN.md **before any screen** — type
   roles, spacing, both color modes, the icon set, tiles/rows/buttons, and the
   report-render keyframes.
3. SQLite schema, repositories, stores, and the notification engine per
   ARCHITECTURE.md (run the Week-1 notification-action spike first).
4. Product screens in ROADMAP Phase-1 order (Today → Meds → Trends →
   Insights/Report → Onboarding/Paywall → Settings), wiring real flows end to
   end — no mocked handlers left behind.
5. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (being
   dismissed with "that's just aging" and apps that track symptoms but not
   treatment), show the product running within 5 seconds (the report render),
   this app's one device (the doctor-ready page assembling), honest receipts
   (never fabricated), one CTA phrase repeated verbatim.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- Typecheck, lint, and production build are green (`npm run typecheck &&
  npm run lint && npm run build:check`), with zero console errors.
- Every screen matches DESIGN.md at 390px in both color modes, including
  empty, loading, and error states; `prefers-reduced-motion` collapses the
  report render to a fade.
- Airplane-mode test passes: every feature except purchase works offline.
- The wellness-line checklist passes on all insight templates and education
  copy: no diagnosis, no dosing advice, no causal claims.
