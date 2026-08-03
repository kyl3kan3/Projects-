import type { MetadataRoute } from "next";

/**
 * The PWA manifest. Bills get photographed at the meter, so the app has to be
 * installable to a home screen. Prerendered at build time — real values, never a throw.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GreenTally",
    short_name: "GreenTally",
    description:
      "Upload your utility bills, get a defensible Scope 1/2/3 footprint, a CSRD-lite PDF, and ready-to-paste questionnaire answers.",
    start_url: "/footprint",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F4ED",
    theme_color: "#F6F4ED",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Upload bills", url: "/documents" },
      { name: "Questionnaire answers", url: "/answers" },
    ],
  };
}
