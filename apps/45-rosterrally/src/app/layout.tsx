import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Archivo (including its width axis, so the display
 * role can be genuinely SemiExpanded rather than letter-spaced) for all UI, IBM
 * Plex Mono for every time, fee, count and jersey number. `next/font` self-hosts
 * the woff2 and emits the preload links, so there is no silent system-font
 * fallback — DESIGN_LANGUAGE.md rule 7 counts that as a failed build.
 */
const sans = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RosterRally — registration, rosters and schedules for youth sports clubs",
    template: "%s · RosterRally",
  },
  description:
    "Season registration with payments, rosters, conflict-checked schedules, parent messages you can prove arrived, and volunteer signups — so a club's registrar gets their ten hours a week back.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3045"),
};

export const viewport: Viewport = {
  themeColor: "#121711",
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
