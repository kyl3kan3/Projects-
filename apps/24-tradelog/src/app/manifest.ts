import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradeLog — the trading journal that tells you the truth",
    short_name: "TradeLog",
    description:
      "Import every trade automatically, see which setups make you money, and get told which habits bleed you dry.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#101418",
    theme_color: "#101418",
    orientation: "portrait",
  };
}
