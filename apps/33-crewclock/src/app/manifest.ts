import type { MetadataRoute } from "next";

/**
 * The web app manifest. Prerendered at build time, so every value here is
 * real — a metadata route that throws or returns a stub fails the build.
 *
 * `start_url` is /clock rather than /: a crew member installs this to punch,
 * and the marketing page is not what should open from a home-screen icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CrewClock — crew time clock",
    short_name: "CrewClock",
    description:
      "Punch in and out at the job site. Works with no signal — punches are saved on the phone and sync when the signal returns.",
    start_url: "/clock",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#12161a",
    theme_color: "#12161a",
    lang: "en",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
