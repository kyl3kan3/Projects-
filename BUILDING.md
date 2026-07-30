# Building the portfolio

Every app under `apps/` builds: **77 buildable units, 77 passing**, about 19
minutes for the whole portfolio from a clean checkout. The last recorded run is
in [BUILD_STATUS.txt](./BUILD_STATUS.txt).

This document says how to build them all at once, what "builds" means per stack,
and what is deliberately not covered.

```bash
tools/setup-buildkit.sh     # one-time: install the shared toolchains
tools/build-all.sh          # build every app, print a pass/fail table
tools/build-all.sh 31 57    # build only units whose path contains 31 or 57
```

Building a single app on its own needs none of this — the folders are still
self-contained, so `cd apps/03-briefcast && npm install && npm run build` works
exactly as the root README describes.

## Why there is a shared toolchain

Each app pins its own dependency ranges (SCAFFOLD_GUIDE.md rule 4) and none of
them reference anything outside their folder (rule 1). Installing all 77
buildable units separately costs tens of gigabytes and well over an hour, most
of it re-downloading the same copy of Next.js.

Naively sharing one install instead is wrong in a way that is easy to miss: an
app pinning `stripe@^18` type-checked against `stripe@17` fails on an
`apiVersion` string literal that is perfectly correct for the version it asked
for. A shared install quietly reports defects the app does not have.

So `tools/build-all.sh` keeps one toolchain per stack in `.buildkit/` and, for
each app, has `tools/link-deps.mjs` assemble a `node_modules` of symlinks into
it — installing individually any package whose declared range the shared copy
does not satisfy (cached in `.buildkit/extra/`, so the second app that wants
`drizzle-orm@^0.41` pays nothing). Every version an app compiles against
satisfies its own manifest. Nothing under `apps/` is modified.

Only packages an app actually imports are linked, plus the build tooling for its
stack. A declared-but-unused dependency is never installed, which is why the
whole portfolio builds from roughly 2.5 GB of shared install.

## What "builds" means, per stack

| Stack | Units | Gate | Why that gate |
|---|---|---|---|
| Next.js (web) | 59 | `next build` | Full production build: compile, typecheck, prerender every static route |
| Expo (mobile) | 12 | `tsc --noEmit` | A real binary needs EAS credentials plus Xcode/Android SDK; the typecheck covers the whole router tree and lib code |
| Python (FastAPI) | 2 | `compileall` + `mypy` | Both are API products whose modules are still docstring-only stubs |
| Astro (directory engine) | 1 | `tsc --noEmit` + `astro build` | Real static build, including the sitemap and Tailwind integrations |
| Tauri (desktop) | 1 | `tsc --noEmit` + `vite build` | Frontend only — see the limitation below |
| Node (Probot / Fastify / extension) | 2 | `tsc --noEmit` | No bundling step of their own yet |

Unit count is 77, not 74, because three mobile apps ship a companion project
beside the client (`41-studyreel/web`, `63-netnest/server`, `70-gigbag/server`)
that builds separately.

Linting is not part of the gate. `next lint` is deprecated in Next 15.5 and most
apps have no ESLint config yet; `tools/build-all.sh` passes `--no-lint`.

## Known limitations

- **The ShotStash Rust shell is not compiled here.** `20-shotstash/src-tauri`
  now has the correct Tauri 2 crate layout (`lib.rs` + thin `main.rs` +
  `build.rs`) and `cargo` parses the manifest and resolves every crate, but
  `cargo check` needs GTK/WebKit development headers (`gdk-3.0`,
  `libwebkit2gtk-4.1-dev`) that a headless container does not carry. On a Linux
  desktop with those installed, `cd apps/20-shotstash/src-tauri && cargo check`
  is the missing gate.
- **Expo apps are typechecked, not built.** See the table above.
- **The Expo toolchain is pinned to the Expo 52 line**, which 11 of the 12
  mobile apps target. `11-driftoff` is on Expo 53 and gets its own resolved
  copies automatically, which is why it takes noticeably longer.
- **Stub-level builds.** Most apps are still scaffolds: pages return `null` and
  library modules are TODO lists. The build proves the toolchain, config, types,
  and dependency graph are sound — not that the product does anything.
