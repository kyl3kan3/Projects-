import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RecallDesk — dental patient reactivation",
    short_name: "RecallDesk",
    description:
      "The overdue list, the daily call queue, and a conservative attribution ledger for dental hygiene recall.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F4F6F7",
    theme_color: "#F4F6F7",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
