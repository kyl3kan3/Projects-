import type { MetadataRoute } from "next";

/**
 * Web app manifest. The crew flow is installable on a foreman's phone — but
 * installing is optional and never demanded: a crew link opens in whatever
 * browser the text opened, which is the entire point of having no app.
 *
 * Prerendered during `next build`, so it returns real values.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafetyDeck",
    short_name: "SafetyDeck",
    description:
      "Toolbox talks with crew sign-off, an OSHA 300/300A incident log, and cert-expiry tracking for small construction and field companies.",
    start_url: "/talks",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // From DESIGN.md: tarmac is the ground on every screen.
    background_color: "#17150F",
    theme_color: "#17150F",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
