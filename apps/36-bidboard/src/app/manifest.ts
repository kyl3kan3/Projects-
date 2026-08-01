import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BidBoard — subcontractor bid management",
    short_name: "BidBoard",
    description:
      "Invite subs by trade, collect bids through a no-login portal, level them side by side, award and notify.",
    start_url: "/projects",
    display: "standalone",
    background_color: "#14181d",
    theme_color: "#14181d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
