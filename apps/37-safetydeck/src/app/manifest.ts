/**
 * src/app/manifest.ts
 *
 * Web app manifest for the PWA (Next.js metadata route). The crew flow is
 * installable on foremen's phones; the dashboard benefits too.
 *
 * Next prerenders this route during `next build`, so unlike the page stubs it
 * returns a real manifest rather than throwing.
 *
 * TODO:
 * - [ ] Icons: 192/512 maskable PNGs (the flat hard-hat mark, no emoji).
 * - [ ] start_url "/" with a crew-link interception note: crew tokens open
 *       fine in-browser; install is optional, never demanded.
 * - [ ] Pair with the Serwist service worker registration (src/sw.ts via
 *       @serwist/next) for talk precache + outbox sync.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafetyDeck",
    short_name: "SafetyDeck",
    description:
      "Toolbox talks with crew sign-off, an OSHA 300/300A incident log, and cert-expiry tracking for small construction and field companies.",
    start_url: "/",
    display: "standalone",
    // Both from DESIGN.md: tarmac is the ground on every screen.
    background_color: "#17150F",
    theme_color: "#17150F",
    icons: [
      // TODO: replace once the flat hard-hat mark exists as real PNGs.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
