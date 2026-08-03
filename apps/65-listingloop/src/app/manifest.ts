import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ListingLoop",
    short_name: "ListingLoop",
    description:
      "Every deadline on the contract, on one line — with the reminders already sent.",
    start_url: "/deals",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
