# Brief for an agent building one app

You have been given exactly one app folder under `apps/`. Build it into a working
product. Read this file first, then the folder's own `BUILD.md`, which is the
authority on scope and craft for that app.

## Scope

The app's `README.md` has an **MVP Feature List**. That list is your scope —
nothing more, nothing less. Post-MVP items are explicitly out; don't build them.

Read in this order (the folder's `BUILD.md` says the same):
`README.md` → `ARCHITECTURE.md` → `DESIGN.md` → `ROADMAP.md` (milestone 1 only),
plus the in-folder `DESIGN_LANGUAGE.md` and `MARKETING_PLAYBOOK.md`.

## Hard rules

1. **Stay inside your app folder.** Do not edit any other app, any root file, or
   anything under `tools/`. Other agents are working in parallel in the same
   checkout, and a stray edit outside your folder will collide with theirs.
2. **Do not run git.** No `git add`, `commit`, `checkout`, `stash`, or `push`.
   Commits are made centrally after your work is reviewed. Running git will race
   on the index and can destroy other agents' work.
3. **No secrets.** `.env.example` gets descriptive placeholders only
   (`your-stripe-secret-key`), never real or realistic-looking keys.
4. **Follow the app's `DESIGN.md` exactly.** It is a redline spec, not
   inspiration: the palette hexes, type scale, spacing steps and component
   construction are requirements. No purple (any hue ~250–310°), no framework
   default palette hexes, no emoji in product UI, no gradients or glow on
   controls, one accent rationed to ≤10% of a screen, mobile-first at 390px.
5. **Real content everywhere.** No lorem, no grey placeholder bars. Plausible
   product data in every screen, including empty and error states.
6. **Landing page last**, to `MARKETING_PLAYBOOK.md`. Never fabricate
   testimonials, logos, or usage numbers — these products are pre-launch. Label
   staged demos as demos.

## Portfolio conventions

These were established by the two finished reference apps. Match them; don't
invent a different approach.

- **Reference implementations:** `apps/01-clipforge` and `apps/05-pulsewatch`.
  Read them for patterns — auth, db client, billing, queue, plan gating, server
  actions, component structure. `05-pulsewatch` is the most complete.
- **Auth:** scrypt password hashing + a signed JWT session cookie via `jose`.
  Copy the shape from `apps/05-pulsewatch/src/lib/auth.ts`. Add `jose` to your
  app's dependencies if it isn't there.
- **Database:** Drizzle + `postgres` (postgres.js). The client must be a lazy
  singleton so `next build` never opens a socket, and must use:
  ```ts
  max: process.env.VERCEL ? 1 : 10,
  idle_timeout: process.env.VERCEL ? 20 : undefined,
  prepare: false,   // required by Neon's pooled endpoint
  ```
- **Deployment target is Vercel + Neon.** Read the root `DEPLOYING.md`. It
  matters most if your `ARCHITECTURE.md` calls for a worker or queue: Vercel has
  no always-on processes, and Hobby cron runs only once per day. If your app
  needs background work, implement it as a cron-triggered route with a bounded
  time budget (see `apps/05-pulsewatch/src/app/api/cron/tick/route.ts`) and
  protect it with `CRON_SECRET`, refusing to run when the secret is unset.
- **Stub idioms that break the build**, and must not appear in a `page.tsx`:
  `throw new Error("Not implemented")` (Next prerenders pages, so this fails the
  build) and a bare `export {}` (no default export). Metadata routes
  (`manifest.ts`, `sitemap.ts`, `robots.ts`) are prerendered too — return real
  values.
- **Tests:** use Node's built-in runner via `tsx`, so no test dependency is
  added: `"test": "tsx --test src/**/*.test.ts"`. Cover the domain logic that
  would be expensive to get wrong — date/schedule maths, money, plan limits,
  parsers, state machines.

## Dependencies and building

Do **not** run `npm install` in your app folder. The repo shares one toolchain.
From the repo root:

```bash
node tools/link-deps.mjs apps/<your-app> --kit web    # or --kit expo / --kit node
```

Re-run it whenever you add a dependency to `package.json`. It links the shared
copy when the version satisfies your declared range and installs the package
separately when it doesn't. If a build fails on a missing module, re-run it
first.

Then, from inside your app folder:

```bash
PATH="node_modules/.bin:$PATH" tsc --noEmit
PATH="node_modules/.bin:$PATH" npm test
PATH="node_modules/.bin:$PATH" NEXT_TELEMETRY_DISABLED=1 next build --no-lint
```

## Verification — this is the part that matters

A build passing is **not** evidence the app works. On the one app built this way
so far, the production build was green while four real defects sat in it,
including one where certificate-expiry alerts fired once and then went silent
forever. Compiling and working are different claims.

Shared local infrastructure is already running for you:

- **Postgres:** `postgres://postgres@localhost:5433/<your_db>` — create your own
  database, named after your app with underscores (e.g. `app_06_vaultback`):
  `su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH createdb -h /tmp -p 5433 -U postgres app_06_vaultback"`
- **Redis:** `redis://localhost:6380`
- **Your web port:** `3000 + your app number` (app 06 → 3006, app 42 → 3042).
  Never use another app's port.

Write a `.env.local` with those values, run `npm run db:migrate`, start the app,
and **actually exercise the MVP feature list end to end** — sign up, do the core
action, read the result back, hit the failure paths. A throwaway script driving
your own domain functions against the real database is the fastest way; delete it
when done, keeping anything valuable as a unit test.

Fix what you find. Expect to find something.

### A real browser is available — use it

**Chromium is pre-installed** at `/opt/pw-browsers` with `PLAYWRIGHT_BROWSERS_PATH`
already set, and `playwright` links like any other package. Do **not** run
`playwright install` — the browser is already there.

```bash
node tools/link-deps.mjs apps/<your-app> --kit web   # links playwright
```

This matters because server actions cannot be driven from `curl`: Next 15
encrypts the action payload, so a curl POST reaches the action and then dies in
RSC argument decoding. Without a browser you can only test the functions *behind*
your actions, which leaves the entire client round trip — the thing a user
actually touches — unverified.

Drive the real forms in Chromium at 390×844. It also lets you check what nothing
else can: layout at the spec's width, contrast, focus order, whether
`prefers-reduced-motion` really collapses the animation, and console errors.
Screenshots are worth taking; a rendered screen catches things reading CSS never
will.

### Do not kill processes by pattern

Several agents work in this checkout at once. `pkill -f "next dev"`,
`pkill -f next-server`, and `pkill -o` have all killed *other* agents' servers in
past runs. Kill only your own process:

```bash
next start -p <your-port> & echo $! > .server.pid   # then kill $(cat .server.pid)
```

If you must hunt a PID, confirm it is yours first — `readlink /proc/<pid>/cwd`
must be your app folder.

## When you finish

Leave the working tree clean of scratch files (`.env.local`, throwaway scripts).
Report back:

1. Which MVP items work, verified how.
2. Anything you could **not** verify, and why. Be specific — "WHOIS needs
   outbound port 43, which is blocked here" is useful; "mostly works" is not.
3. Bugs you found and fixed while testing.
4. Anything you deliberately left out, and why.
5. Final state of `tsc --noEmit`, `npm test`, and `next build`.

Do not overstate. An honest "these three items work, this one is untested
because X" is worth more than a confident summary that turns out to be wrong.
