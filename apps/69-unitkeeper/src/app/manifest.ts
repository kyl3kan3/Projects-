import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UnitKeeper",
    short_name: "UnitKeeper",
    description:
      "A live unit map, ten-minute move-ins, autopay with a late ladder, and the lien clock that runs itself.",
    start_url: "/map",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
  };
}
