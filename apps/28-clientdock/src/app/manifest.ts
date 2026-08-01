import type { MetadataRoute } from "next";

/**
 * Clients open portals from a phone and often keep them on the home screen, so the
 * manifest matters more here than on most marketing sites. Ivory ground, no theme
 * switch: the portal has one visual world.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClientDock",
    short_name: "ClientDock",
    description:
      "One branded link where your clients see status, files, approvals and invoices.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#f4f1ea",
    orientation: "portrait",
  };
}
