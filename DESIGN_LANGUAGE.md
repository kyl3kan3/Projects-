# Portfolio Design Language

Every app in `apps/` ships a `DESIGN.md` — a studio-grade design specification.
Each product has its own visual identity, but they all obey one motion-and-craft
constitution so the portfolio feels like the work of a single world-class studio.

## The bar

Every design must have exactly **one signature moment** — a hero interaction or
3D scene a user would screen-record and share. Everything else stays quiet so the
signature moment owns the attention. Restraint is the tell of an expensive studio:
one wow, a thousand perfect details.

## Shared motion tokens

All apps reference these tokens (names are canonical; values may not be overridden):

| Token | Value | Use |
|---|---|---|
| `ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances, reveals — fast start, long elegant settle |
| `ease-in-out-soft` | `cubic-bezier(0.65, 0, 0.35, 1)` | Position/layout changes |
| `ease-anticipate` | `cubic-bezier(0.36, 0, 0.66, -0.56)` → `ease-out-expo` | Two-part launches (pull back, then fire) |
| `spring-snappy` | mass 1 · stiffness 400 · damping 30 | Buttons, toggles, drag-release |
| `spring-gentle` | mass 1 · stiffness 170 · damping 26 | Cards, modals, list reordering |
| `dur-micro` | 120ms | Hover, press, checkbox |
| `dur-standard` | 240ms | Dropdowns, tooltips, tab switches |
| `dur-emphasis` | 420ms | Modals, page-section reveals |
| `dur-hero` | 700–1200ms | Signature moments only |

**Choreography rules**
1. Stagger children at 30–50ms; never animate more than 12 elements at once.
2. Nothing blocks input: all hero animation is interruptible or ambient.
3. Enter animations move ≤ 24px; opacity never starts below 0 for text (start at 0.001 to avoid font flash, but perceptually visible by 40% of duration).
4. Exit is always faster than enter (~0.6× duration).
5. One property owns the story per transition (transform OR opacity leads; the other supports).

## 3D & rich media stack

| Need | Tool | Rule |
|---|---|---|
| Real-time 3D scenes | React Three Fiber + drei | Hero sections and signature moments only |
| Vector/character motion | Rive (interactive) / Lottie (playback) | Mascots, loaders, empty states |
| Shader effects | Custom GLSL via R3F `shaderMaterial` | Gradients, noise fields, scan effects |
| Scroll choreography | Framer Motion + `useScroll` | Marketing pages |
| Product-UI motion | Framer Motion (web) / Reanimated (Expo) / Core Animation specs (desktop) | Everything in-app |

**3D budget:** one WebGL canvas per page, ≤ 1.5MB total GLB (Draco-compressed),
≤ 60k triangles in view, target 60fps on an M1 Air / Pixel 7, DPR capped at 2.
Every 3D scene ships a static poster-image fallback (no WebGL, low-power mode, SSR).

## Performance & accessibility (non-negotiable)

- LCP ≤ 1.8s on the marketing page; 3D lazy-loads after first paint behind the poster.
- `prefers-reduced-motion`: all movement collapses to ≤ 80ms opacity crossfades; 3D scenes become their poster image. Feature-complete, never punitive.
- Contrast: AA minimum everywhere, AAA for body text on dashboards.
- Focus states are designed (2px offset ring in each brand's accent), never default.
- Type scale is modular per app (defined in each DESIGN.md); minimum body 15px product UI, 16px marketing.

## DESIGN.md anatomy

Each spec contains, in order: **Design vision** (the feel, one paragraph) ·
**Brand identity** (palette table, typography, logo direction, voice) ·
**Art direction** (surfaces, depth, texture, grid) · **The signature moment**
(fully specced hero interaction/3D scene) · **Motion system** (per-app choreography
on top of shared tokens) · **Key screens** (marketing hero, core product screen,
the "money screen") · **Component language** (buttons, cards, states) ·
**Reduced-motion & fallback plan**.
