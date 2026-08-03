import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SessionScribe",
    short_name: "SessionScribe",
    description:
      "AI-drafted progress notes for solo therapists. You review, edit and sign; nothing is ever auto-filed.",
    start_url: "/today",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
