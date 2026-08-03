import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans, Source_Serif_4 } from "next/font/google";
import { THEME_COLOR } from "@/lib/theme";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Source Serif 4 600 for display (deed-stamp
 * authority), Public Sans 400/500 for UI and body, IBM Plex Mono 500 for every
 * date, price and file number.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so
 * there is no silent fallback to the system font — DESIGN.md counts that as a
 * failed build, and a stylesheet link to a font CDN would have been exactly
 * that.
 */
const display = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ListingLoop — every deadline on the contract, on one line",
    template: "%s · ListingLoop",
  },
  description:
    "Transaction coordination for real-estate agents and TCs. The contract's dates become a computed timeline the moment the deal opens, with business-day and holiday rules, diff-preview recompute, and the reminders already sent.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3065"),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
      style={
        {
          "--font-display": "var(--font-display-loaded), ui-serif, Georgia, serif",
          "--font-sans": "var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-mono-loaded), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
