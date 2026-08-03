import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/theme";

/**
 * The web manifest. ChairFlow is used between clients, on a phone, so it installs to the
 * home screen rather than shipping a native app (README: "the web app is installable").
 * Metadata routes are prerendered, so this returns real values.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChairFlow",
    short_name: "ChairFlow",
    description:
      "Booking and no-show protection for chair-renting stylists and barbers.",
    start_url: "/today",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
