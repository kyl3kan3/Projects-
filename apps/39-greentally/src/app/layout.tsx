import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans, Spectral } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Spectral for display and report headings (the document
 * voice), Public Sans for UI, IBM Plex Mono for every figure, factor and unit.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so there
 * is no silent system-font fallback — DESIGN.md counts that as a failed build, and a
 * stylesheet link to a font CDN would have been exactly that.
 */
const display = Spectral({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
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
    default: "GreenTally — the questionnaire answered before lunch",
    template: "%s · GreenTally",
  },
  description:
    "Carbon reporting for SMBs under supplier pressure: upload your utility bills and a spend CSV, get a defensible Scope 1/2 (+ spend-based Scope 3) footprint, a CSRD-lite PDF, and ready-to-paste answers for CDP/EcoVadis-style questionnaires.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3039"),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f6f4ed",
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
