/**
 * The design system, as a stylesheet string — a redline implementation of
 * DESIGN.md v3.
 *
 * Served as a real CSS file (not inlined) so it caches, and written by hand
 * because the manifest has no CSS toolchain: this app is a Probot server, and
 * pulling a bundler in to style four screens would be the wrong trade.
 *
 * Fonts are self-hosted woff2 (public/fonts) and preloaded by the layout. A
 * silent system-font fallback is a failed build, so `local()` sources are
 * deliberately absent — either our file loads or the fallback stack is visibly
 * not Inter.
 */

export const CSS = String.raw`
/* ---------------------------------------------------------------- fonts --- */
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-latin-var.woff2") format("woff2");
  font-weight: 400 600;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
    U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215,
    U+FEFF, U+FFFD;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("/fonts/jetbrains-mono-latin-var.woff2") format("woff2");
  font-weight: 400 500;
  font-style: normal;
  font-display: swap;
}

/* --------------------------------------------------------------- tokens --- */
:root {
  color-scheme: dark; /* single visual world; no light theme at v1 */

  --editor: #0D1117;
  --panel: #161B22;
  --hairline: #262C36;
  --hairline-press: #333B45;
  --text: #E6EDF3;
  --text-2: #8B949E;
  --text-3: #565E68;
  --paper: #F0F3F6;
  --paper-press: #DDE3E9;
  --disabled-fill: #21262E;
  --pr-blue: #3E7BD6;
  --diff-green: #3FB950;
  --diff-red: #F85149;
  --well: #0A0E14;

  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  /* Radii: exactly three. */
  --r-control: 8px;
  --r-panel: 12px;
  --r-sheet: 16px;

  --gutter: 20px;
  --tabbar-h: 56px;

  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out-soft: cubic-bezier(0.65, 0, 0.35, 1);
  --spring-snappy: cubic-bezier(0.2, 0.9, 0.2, 1.2);
}

*,
*::before,
*::after {
  box-sizing: border-box;
  border-color: var(--hairline);
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  background: var(--editor);
  color: var(--text);
  font-family: var(--font-sans);
  font-weight: 400;
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 24px);
}

::selection {
  background: rgba(62, 123, 214, 0.32);
}

a {
  color: var(--pr-blue);
  text-decoration: none;
}
a:active {
  opacity: 0.8;
}

:focus-visible {
  outline: 2px solid var(--pr-blue);
  outline-offset: 2px;
  border-radius: 4px;
}

/* ----------------------------------------------------------- type roles --- */
.t-h2 {
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  font-weight: 600;
  margin: 0;
}
.t-title {
  font-size: 16px;
  line-height: 1.35;
  font-weight: 600;
  margin: 0;
}
.t-body {
  font-size: 16px;
  line-height: 1.55;
  margin: 0;
}
.t-sec {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-2);
  margin: 0;
}
.t-label {
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--text-2);
  margin: 0;
}
.t-data,
code,
kbd,
pre {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "calt" 0; /* ligatures off: diff fidelity beats prettiness */
}
.t-data {
  font-size: 12px;
  line-height: 1.3;
  font-weight: 500;
  color: var(--text-2);
}
.t-code {
  font-size: 13px;
  line-height: 1.5;
  font-weight: 400;
}
.t-stat {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 32px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.muted {
  color: var(--text-2);
}
.faint {
  color: var(--text-3);
}

/* -------------------------------------------------------------- layout ---- */
.wrap {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--gutter);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 56px;
  border-bottom: 1px solid var(--hairline);
  padding: 0 var(--gutter);
  position: sticky;
  top: 0;
  background: color-mix(in srgb, var(--editor) 94%, transparent);
  backdrop-filter: blur(8px);
  z-index: 5;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px; /* tap targets are >= 44px, the wordmark included */
  font-weight: 600;
  color: var(--text);
}
.brand svg {
  color: var(--pr-blue);
}

.stack > * + * {
  margin-top: 12px;
}
.stack-lg > * + * {
  margin-top: 24px;
}
section {
  margin: 32px 0;
}
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

/* --------------------------------------------------------------- rows ----- */
/* List rows carry no boxes: hairline rows, >=56px. */
.rows {
  border-top: 1px solid var(--hairline);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 0;
  border-bottom: 1px solid var(--hairline);
}
.row > .grow {
  flex: 1;
  min-width: 0;
}
.row .t-title,
.row .t-data {
  overflow-wrap: anywhere;
}

/* -------------------------------------------------------------- panels --- */
.panel {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: var(--r-panel);
  padding: 16px;
}
.well {
  background: var(--well);
  border-radius: var(--r-control);
  padding: 12px;
  overflow-x: auto;
  margin: 0;
}
.well code {
  white-space: pre;
  font-size: 13px;
  line-height: 1.5;
  display: block;
}
.diff-add {
  color: var(--diff-green);
}
.diff-del {
  color: var(--diff-red);
}

/* Finding card: panel fill, 2px pr-blue left rule, radius 12. */
.finding {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-left: 2px solid var(--pr-blue);
  border-radius: var(--r-panel);
  padding: 16px;
}
.finding.gated {
  border-left-color: var(--hairline);
}
.finding > * + * {
  margin-top: 12px;
}
.finding-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-control);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.chip-cat {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  height: 24px;
}
.chip-cat.security {
  color: var(--diff-red);
  border-color: color-mix(in srgb, var(--diff-red) 40%, var(--hairline));
}
.chip-cat.bug {
  color: var(--text);
}
.chip-cat.standards {
  color: var(--pr-blue);
  border-color: color-mix(in srgb, var(--pr-blue) 40%, var(--hairline));
}

/* -------------------------------------------- the signature: confidence --- */
.meter {
  display: flex;
  align-items: center;
  gap: 8px;
}
.meter-track {
  display: flex;
  gap: 4px;
}
.seg {
  width: 16px;
  height: 6px;
  border-radius: 2px;
  border: 1px solid var(--hairline);
  background: transparent; /* below-threshold segments are empty sockets */
}
.seg.on {
  background: var(--pr-blue);
  border-color: var(--pr-blue);
  transform-origin: left center;
  animation: seg-fill 60ms var(--ease-out-quart) both;
}
.seg.on.last {
  animation: seg-land 180ms var(--spring-snappy) both;
}
.seg.on:nth-child(2) { animation-delay: 60ms; }
.seg.on:nth-child(3) { animation-delay: 120ms; }
.seg.on:nth-child(4) { animation-delay: 180ms; }
.seg.on:nth-child(5) { animation-delay: 240ms; }
.meter-value {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
}
@keyframes seg-fill {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@keyframes seg-land {
  0% { transform: scaleX(0); }
  70% { transform: scaleX(1.12); }
  100% { transform: scaleX(1); }
}

/* ------------------------------------------------------------- controls --- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  border-radius: var(--r-control);
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 120ms var(--ease-in-out-soft), background-color 120ms linear;
}
.btn-primary {
  background: var(--paper);
  color: var(--editor);
}
.btn-primary:active {
  transform: scale(0.98);
  background: var(--paper-press);
}
.btn-secondary {
  background: transparent;
  border-color: var(--hairline);
  color: var(--text);
}
.btn-secondary:active {
  border-color: var(--hairline-press);
}
.btn[disabled] {
  background: var(--disabled-fill);
  color: var(--text-3);
  cursor: not-allowed;
}
.btn-quiet {
  background: none;
  border: none;
  color: var(--pr-blue);
  font-size: 15px;
  font-weight: 600;
  padding: 12px 0;
  min-height: 44px;
  cursor: pointer;
}
.actions {
  display: flex;
  gap: 12px;
}
.actions .btn {
  flex: 1;
}

input[type="text"],
input[type="number"] {
  width: 100%;
  height: 48px;
  padding: 0 12px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text);
  background: var(--editor);
  border: 1px solid var(--hairline);
  border-radius: var(--r-control);
}
input:focus-visible {
  border-color: var(--pr-blue);
  outline: 2px solid rgba(62, 123, 214, 0.25);
  outline-offset: 2px;
}
label.field {
  display: block;
}
label.field .t-label {
  margin-bottom: 8px;
}

/* -------------------------------------------------------- summary bar ----- */
.summary-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--hairline);
}
.summary-bar svg {
  color: var(--pr-blue);
  flex: none;
}

/* --------------------------------------------------------------- stats ---- */
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.stat > .t-label {
  margin-bottom: 4px;
}

.trend {
  display: block;
  width: 100%;
  height: 72px;
}
.trend path {
  fill: none;
  stroke: var(--pr-blue);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* -------------------------------------------------------------- tabbar ---- */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--hairline);
  z-index: 10;
}
.tabbar a {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 600;
  text-decoration: none;
  position: relative;
}
.tabbar a[aria-current="page"] {
  color: var(--text);
}
.tabbar a[aria-current="page"]::after {
  content: "";
  position: absolute;
  bottom: 6px;
  width: 2px;
  height: 2px;
  border-radius: 1px;
  background: var(--pr-blue);
}

/* --------------------------------------------------------------- empty ---- */
.empty {
  padding: 32px 0;
  border-top: 1px solid var(--hairline);
}
.empty .t-title {
  margin-bottom: 8px;
}

.notice {
  border: 1px solid var(--hairline);
  border-left: 2px solid var(--diff-red);
  border-radius: var(--r-panel);
  padding: 16px;
  background: var(--panel);
}
.notice.ok {
  border-left-color: var(--diff-green);
}

/* ------------------------------------------------------------ utilities --- */
/* A small, closed set of layout helpers. They exist because the dashboard's CSP
   is "style-src 'self'" with no 'unsafe-inline': an inline style attribute is
   silently dropped by the browser, which a real browser found and a build did
   not. Spacing values are the 4px scale from DESIGN.md — nothing else. */
.mt-4 { margin-top: 4px; }
.mt-8 { margin-top: 8px; }
.mt-12 { margin-top: 12px; }
.mt-16 { margin-top: 16px; }
.mt-24 { margin-top: 24px; }
.mt-32 { margin-top: 32px; }
.mb-8 { margin-bottom: 8px; }
.mb-12 { margin-bottom: 12px; }
.mb-16 { margin-bottom: 16px; }
.mb-24 { margin-bottom: 24px; }
.m-0 { margin: 0; }
.block { display: block; }
.flex-none { flex: none; }
.w-full { width: 100%; }
.h-44 { height: 44px; min-height: 44px; }
.inherit { color: inherit; }
.sec-2 { color: var(--text-2); }
.danger { color: var(--diff-red); }
.no-top-border { border-top: none; }
.no-bottom-border { border-bottom: none; }
.pad-16 { padding: 16px; }
.r-control { border-radius: var(--r-control); }

.hero-title {
  font-size: clamp(32px, 8.5vw, 56px);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

/* The demo frame on the landing page: a pull request, rendered. */
.demo { padding: 0; overflow: hidden; }
.demo-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--hairline);
}

/* ---------------------------------------------------------- responsive ---- */
@media (min-width: 768px) {
  :root {
    --gutter: 32px;
  }
  body {
    padding-bottom: 40px;
  }
  .stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .tabbar {
    position: static;
    height: auto;
    padding: 0;
    background: none;
    border-top: none;
    border-bottom: 1px solid var(--hairline);
    backdrop-filter: none;
  }
  .tabbar a {
    flex-direction: row;
    gap: 8px;
    padding: 12px 16px;
    font-size: 13px;
    justify-content: flex-start;
    flex: none;
  }
  .tabbar a[aria-current="page"]::after {
    position: static;
    width: 4px;
    height: 4px;
  }
  .two-pane {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .seg.on {
    animation: none;
    transform: none;
  }
}
`;
