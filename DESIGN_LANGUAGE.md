# Portfolio Design Language — v2 (mobile-first)

Every app in `apps/` ships a `DESIGN.md`. Each product has its own identity, but
all obey one constitution so the portfolio reads like one studio shipped it.

**This is a full rewrite of v1.** v1 chased a gimmicky "one big 3D set-piece per
app" formula that read as AI-generated spectacle. v2 corrects course: **restraint,
typographic craft, and a phone-first mindset.** The wow now comes from precision —
spacing, type, one perfect detail — not from a WebGL centerpiece.

---

## Two non-negotiables

### 1. Mobile-first, always
Design the **390 × 844 phone screen first.** Every `DESIGN.md` describes the
mobile layout as its primary spec; tablet and desktop are described as how that
scales *up*. A design that only works on a wide screen is unfinished.

- **Touch targets:** ≥ 44 × 44 px, ≥ 8px apart. The primary action lives in the
  bottom third (thumb zone) on app screens.
- **One-hand reachability:** primary nav and CTAs reachable by a thumb; never put
  the only way forward in a top corner.
- **Type:** body ≥ 16px on mobile (prevents iOS zoom-on-focus); fluid scale via
  `clamp()` so nothing is set in fixed px across breakpoints.
- **Layout:** single column by default; content max-width ~65ch on larger screens.
  Wide content (tables, code, timelines) scrolls inside its own `overflow-x:auto`
  container — the page body never scrolls sideways.
- **Safe areas:** respect `env(safe-area-inset-*)`; sticky bars clear the notch and
  home indicator.
- **Gestures where they help** (swipe to dismiss, pull to refresh, long-press),
  but every gesture has a visible button equivalent — gestures are never the only path.
- **Breakpoints (guidance, not law):** `sm 480 · md 768 · lg 1024 · xl 1280`.
  Prefer container queries for components that appear at multiple sizes.

### 2. Restraint over spectacle
The first pass over-animated and over-metaphored. v2:

- **One signature detail per app** — small, purposeful, and it must work on a phone.
  Not a full-screen 3D scene. A considered transition, a live data reveal, a
  typographic move. If it can't run at 60fps on a mid Android, it isn't the signature.
- **3D / WebGL is optional progressive enhancement, desktop-only, never load-bearing.**
  Mobile and reduced-motion always get a first-class static or lightweight-CSS
  treatment that is complete on its own — not a degraded placeholder.
- **Motion is felt, not watched.** Most of it is ≤ 240ms and reactive to input.
  Ambient/looping animation is rare and quiet. When in doubt, remove it.

---

## Shared motion tokens

| Token | Value | Use |
|---|---|---|
| `ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | Entrances, reveals — quick, clean settle |
| `ease-in-out-soft` | `cubic-bezier(0.65, 0, 0.35, 1)` | Position / layout changes |
| `spring-snappy` | stiffness 400 · damping 34 | Buttons, toggles, drag-release |
| `spring-gentle` | stiffness 210 · damping 30 | Cards, sheets, list reorder |
| `dur-micro` | 120ms | Hover, press, checkbox |
| `dur-standard` | 200ms | Dropdowns, tabs, tooltips |
| `dur-emphasis` | 320ms | Sheets, modals, section reveals |

**Choreography:** stagger children 20–40ms, ≤ 8 at once; enter moves ≤ 16px; exit
is ~0.6× enter; one property leads per transition; nothing blocks input.

## Progressive enhancement stack

| Need | Tool | Rule |
|---|---|---|
| Product-UI motion | Framer Motion (web) / Reanimated 3 (Expo) | Default. Cheap, interruptible. |
| Vector/character motion | Rive / Lottie | Loaders, empty states, mascots. Small, cached. |
| Scroll choreography | CSS scroll-driven animations first; Framer Motion `useScroll` if needed | Marketing only. |
| 3D (desktop enhancement) | React Three Fiber | Optional. Lazy-loaded behind a static poster. Never on the mobile critical path. |

**3D budget (when used at all):** desktop-only, ≤ 400KB, ≤ 40k tris, DPR ≤ 2,
lazy after first paint, always a static poster fallback. On mobile it does not load.

## Performance & accessibility (hard requirements)

- **Mobile LCP ≤ 2.0s on a mid device / 4G.** Hero is HTML+CSS, not a canvas.
- **Mobile route JS budget:** keep interactive JS lean; defer anything non-critical.
  No 3D library in the mobile bundle.
- `prefers-reduced-motion`: all movement collapses to ≤ 100ms opacity fades; 3D →
  poster; looping/ambient effects off. Feature-complete, never punitive.
- **Contrast:** AA minimum everywhere, AAA for dashboard body text. Verify both themes.
  **This rule outranks a specific hex.** A per-app `DESIGN.md` is otherwise a
  redline spec, but several of them name a faint grey for small labels, axis ticks
  and placeholders that measures 2.5–3.1:1 on its own ground. Four apps found this
  independently and each raised the token; do the same rather than honour the hex,
  and record the measured ratios next to the change. Measure the text you actually
  ship at the size you ship it — a token that passes at 16px body can fail the 11px
  label it is really used for.
- **Focus states are designed** (2px offset ring in the app's accent), keyboard-complete.
- **Theming:** where an app supports light+dark, drive it through CSS custom
  properties (media query + `data-theme` override), and give both themes equal care.
  An app may deliberately commit to a single visual world — make it a choice, not an omission.

## Anti-slop guardrails

Avoid the current AI-design clichés (purple is banned outright — see rule 11; the
rest need genuine identity justification):
purple→blue hero gradients on white; a lone acid-green pop on near-black; Inter/Space
Grotesk as the reflexive "safe" pairing; emoji as section markers; everything centered;
`rounded-2xl` on every surface; a colored accent-bar on every card; faux-glassmorphism
everywhere. Spend boldness in **one** place per screen and keep the rest quiet.

## Craft specification (v2.1 — the rules v2 lacked)

The v2 specs described structure but under-specified craft, and the first builds
proved it: emoji icons, gradient buttons, boxes-in-boxes, wireframe-gray content.
These rules are now binding on every DESIGN.md and every build:

1. **No emoji in product UI. Ever.** Not as icons, not as decorations, not in empty
   states. Iconography is a single consistent SVG set — 20×20 viewBox, 1.75px stroke,
   round caps and joins (Lucide-grade or custom to match). Nav icons 22px. An emoji
   in a shipped screen is a build failure.
2. **No gradient fills on interactive elements.** Buttons, toggles, chips are solid.
   The premium default for a primary button on a dark ground is an **off-white fill
   with ink text** (the Linear/Vercel move); on light grounds, ink fill with paper
   text. Gradients may exist only as large, quiet background atmospheres — never as
   component paint. No glows on buttons.
3. **One accent, rationed.** Each app names ONE accent color and caps it at roughly
   10% of any screen: brand mark, active states, progress, links, the signature
   detail. Accent never fills primary buttons and never appears as large surfaces.
   Semantic colors (success/danger/warning) are separate and used only for meaning.
4. **Space before boxes.** Hierarchy comes from the spacing scale and hairline
   dividers first. A card (border + radius) is reserved for things that are truly
   framed objects — media, sheets, and grouped stat panels. Lists are hairline-divided
   rows, not stacks of boxes. Never nest a card in a card.
5. **A real spacing scale.** 4px base: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`.
   Screen gutter 20px on mobile. Every padding/margin in a DESIGN.md and a build is
   one of these steps — no ad-hoc values.
6. **A real type specimen.** Every DESIGN.md states exact size/line-height/weight/
   tracking for each role (display, h2, title, body, secondary, label, data). Labels
   are 11px/600/+0.08em uppercase — not bolded body text. Data/timestamps are always
   the mono face with tabular figures.
7. **Fonts must actually load.** Self-host or embed (`@font-face`, woff2, preloaded);
   a design that silently falls back to system UI font is a failed build. Previews/
   artifacts embed fonts as base64 data URIs.
8. **Real content only.** No lorem, no gray placeholder bars posing as content.
   Mockups and empty states use plausible product data (real titles, real numbers,
   real sentences). If a screen needs media, art-direct a stand-in (styled still,
   duotone photo treatment) — never a wireframe rectangle.
9. **Radius discipline.** Pick at most three radii per app (e.g. 8 / 12 / 20) and
   assign them to roles (controls / cards / sheets & media). Nothing else.
10. **Hairlines, not borders.** Dividers and card borders are 1px at low contrast
    (~12–16% lightness delta from the ground), never full-contrast strokes.
11. **No purple. Ever.** Violet, purple, lavender, and purple-leaning indigo are
    banned as accents, gradients, glows, or brand marks — the violet-on-dark look
    is the single strongest "this was AI-generated" tell in 2025–26 interfaces.
    If a hue sits between ~250° and ~310°, pick something else.
12. **No framework-default hexes.** Tailwind/Bootstrap palette values
    (`#8B5CF6`, `#2DD4BF`, `#4ADE80`, `#38BDF8`, `#2563EB`, `#10B981`, …) are as
    recognizable as a default theme. Accents are custom-mixed and slightly
    desaturated — professional color is muted color. Anchor each palette in the
    product's real world (ledger green, darkroom amber, blueprint cobalt,
    safety orange), not in a component library's swatch page.

## DESIGN.md anatomy (v2 — tighter)

Each spec, in order, kept lean:
1. **Vision** — 2–3 sentences. The feeling, honestly.
2. **Mobile layout** — the 390px screen, concretely (nav pattern, hero, primary
   action placement, key components at phone width).
3. **Identity** — palette (5–6 named hex), type pairing (display + text + data),
   and the **one signature detail** (mobile-capable).
4. **Responsive** — how mobile scales to tablet/desktop; what the optional desktop
   enhancement adds (if any).
5. **Motion & touch** — the restrained motion set + touch targets, gestures, haptics.
6. **Key screens** — 3–4, described mobile-first.
7. **Reduced-motion & fallback** — what everything degrades to.
