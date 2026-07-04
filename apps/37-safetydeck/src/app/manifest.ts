/**
 * src/app/manifest.ts
 *
 * Web app manifest for the PWA (Next.js metadata route). The crew flow is
 * installable on foremen's phones; the dashboard benefits too.
 *
 * TODO:
 * - [ ] name/short_name "SafetyDeck", display "standalone",
 *       background/theme colors from DESIGN.md (tarmac #17150F).
 * - [ ] Icons: 192/512 maskable PNGs (the flat hard-hat mark, no emoji).
 * - [ ] start_url "/" with a crew-link interception note: crew tokens open
 *       fine in-browser; install is optional, never demanded.
 * - [ ] Pair with the Serwist service worker registration (src/sw.ts via
 *       @serwist/next) for talk precache + outbox sync.
 */

export default function manifest() {
  throw new Error("Not implemented");
}
