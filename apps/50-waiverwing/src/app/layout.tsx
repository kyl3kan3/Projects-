import type { Metadata, Viewport } from "next";
import { Barlow, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Barlow (a DIN-descended signage face — the trailhead
 * voice) for everything, JetBrains Mono for every date, count, id and hash.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so
 * there is no silent system-font fallback — DESIGN.md counts that as a failed
 * build, and the CDN link tag this replaced would have been exactly that on a
 * flaky counter connection.
 */
const sans = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "WaiverWing — signed, searchable, on file in seconds",
    template: "%s · WaiverWing",
  },
  description:
    "Digital waivers and check-in for gyms, tour operators, and rental shops: a waiver builder with real minor/guardian support, kiosk + QR self-serve check-in, and a signed-participant database you can actually search when it matters.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3050"),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#14171a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
      style={
        {
          "--font-display": `var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-sans": `var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-mono": `var(--font-mono-loaded), ui-monospace, Menlo, monospace`,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
