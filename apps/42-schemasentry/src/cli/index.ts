/**
 * src/cli/index.ts
 *
 * The `schemasentry` CLI (commander) — the primary adoption surface.
 *
 * TODO:
 * - [ ] `diff <old> <new>`: offline, no login; human output (colored,
 *       no emoji) and `--json`; exit 0 always (informational).
 * - [ ] `check <spec>`: diff against the registered baseline via the API;
 *       `--fail-on breaking|risky` controls the non-zero exit.
 * - [ ] `push <spec> --api <slug> --version <label> --env prod`: record a
 *       deploy; prints the dashboard diff URL.
 * - [ ] Token auth via SCHEMASENTRY_TOKEN env or `--token`; helpful
 *       unauthenticated errors.
 * - [ ] Output footer on free `diff`: what the hosted check adds (the
 *       funnel line, honest and quiet).
 */

export {};
