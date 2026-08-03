import type { MetadataRoute } from "next";

/**
 * v1 is a mobile-first PWA (README, post-MVP cut list), so the capture screen can
 * be installed to a home screen and opened with gloves on in a driveway.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QuoteFox — send the bid from the driveway",
    short_name: "QuoteFox",
    description:
      "Walk the job narrating on your phone, snap photos, and send a priced, branded proposal before you pull away.",
    start_url: "/jobs",
    display: "standalone",
    background_color: "#16120d",
    theme_color: "#16120d",
    orientation: "portrait",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
