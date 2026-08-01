import type { MetadataRoute } from "next";

/**
 * The PWA manifest. Kiosk mode is a route added to a tablet's home screen, not
 * an app-store install — `display: fullscreen` is what makes that feel like a
 * kiosk rather than a browser tab on a counter.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WaiverWing",
    short_name: "WaiverWing",
    description:
      "Digital waivers and check-in for gyms, tour operators and rental shops. Kiosk mode keeps taking signatures when the Wi-Fi drops.",
    start_url: "/checkin",
    display: "fullscreen",
    orientation: "any",
    background_color: "#14171a",
    theme_color: "#14171a",
    icons: [
      {
        // The blaze, inline. An SVG icon needs no build step and scales to any
        // launcher size; the palette is DESIGN.md's granite and trail.
        src:
          "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#14171A"/><g fill="none" stroke="#D2703A" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 11.5 10 6l5.5 5.5"/><path d="M4.5 16 10 10.5 15.5 16"/></g></svg>',
          ),
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
