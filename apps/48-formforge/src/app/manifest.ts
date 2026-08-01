import type { MetadataRoute } from "next";

/**
 * Metadata routes are prerendered at build time, so they return real values —
 * a throwing stub here fails the production build.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FormForge",
    short_name: "FormForge",
    description: "Patient intake, e-signature and an audit trail for small practices.",
    start_url: "/intakes",
    display: "standalone",
    background_color: "#f7f6f1",
    theme_color: "#f7f6f1",
  };
}
