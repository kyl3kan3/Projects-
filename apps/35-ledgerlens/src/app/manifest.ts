import type { MetadataRoute } from "next";

/**
 * The PWA manifest. Capture is a camera flow on a phone, so the app has to be
 * installable to the home screen — an operator who has to open a browser and find a
 * bookmark before photographing a receipt at the counter will not do it twice.
 *
 * Prerendered at build time, so it returns real values and never throws.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LedgerLens",
    short_name: "LedgerLens",
    description:
      "Forward an invoice, photo a receipt, and hand your accountant a clean monthly close package.",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F6F1",
    theme_color: "#F7F6F1",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Photo a receipt", url: "/capture" },
      { name: "Review flagged items", url: "/review" },
    ],
  };
}
