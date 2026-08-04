import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { THEME_COLOR } from "@/lib/theme";
import "./globals.css";

/**
 * The two faces DESIGN.md names: Public Sans (400/500/700) for display and UI,
 * IBM Plex Mono (500) for every quantity, rate, date and serial. `next/font`
 * self-hosts the woff2 and emits the preload links at build time, so there is no
 * silent fall back to the system UI font — BUILD.md counts that as a failed
 * build.
 */
const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RigRent — double-booked never again",
    template: "%s · RigRent",
  },
  description:
    "Inventory and bookings for party & equipment rental businesses — availability that can't double-book, deposits that actually hold, and condition photos on both ends of every rental.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3060"),
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
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
          "--font-display": "var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-sans": "var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-mono-loaded), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
