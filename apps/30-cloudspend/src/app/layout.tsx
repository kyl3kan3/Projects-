import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Geist for UI, Geist Mono for every dollar figure,
 * delta, timestamp and deploy hash. There is no display face — the numerals are
 * the display.
 *
 * `next/font` self-hosts the woff2 and emits the preload links at build time, so
 * there is no runtime request to a font CDN and no silent fall back to the system
 * UI font, which DESIGN.md counts as a failed build.
 */
const sans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CloudSpend — the ridge caught the night it started growing",
    template: "%s · CloudSpend",
  },
  description:
    "Cloud cost monitoring for startups: know what you spend, get woken up when it spikes, and see exactly which deploy did it.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3030"),
};

export const viewport: Viewport = {
  themeColor: "#0c111c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
