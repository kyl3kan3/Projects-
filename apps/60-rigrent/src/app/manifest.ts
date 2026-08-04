import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RigRent",
    short_name: "RigRent",
    description:
      "Inventory and bookings for party & equipment rental businesses — availability that can't double-book.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
