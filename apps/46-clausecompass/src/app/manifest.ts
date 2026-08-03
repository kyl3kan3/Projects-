import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClauseCompass",
    short_name: "ClauseCompass",
    description:
      "Contract review for freelancers and small businesses: every clause extracted, scored against a playbook, and explained in plain English.",
    start_url: "/contracts",
    display: "standalone",
    background_color: "#faf7f1",
    theme_color: "#faf7f1",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
