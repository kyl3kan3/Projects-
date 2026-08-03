import type { Metadata, Viewport } from "next";
import { Public_Sans, Source_Serif_4, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

/**
 * The three faces DESIGN.md names: Source Serif 4 for display and screen titles
 * (the casebook voice), Public Sans for UI and body (plainspoken US-civic sans),
 * Spline Sans Mono for every timestamp, duration, hash and clock.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so
 * there is no silent fallback to a system font — DESIGN.md counts that as a
 * failed build, and a stylesheet link to a font CDN would have been exactly that
 * on a therapist's waiting-room wifi.
 */
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-serif-loaded",
  display: "swap",
});

const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SessionScribe — the note finished before the next client sits down",
    template: "%s · SessionScribe",
  },
  description:
    "AI-drafted progress notes for solo therapists: record, upload, or type shorthand, then review, edit and sign. The clinician always signs — nothing is ever auto-filed.",
  metadataBase: new URL(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3055",
  ),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
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
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
      style={
        {
          "--font-display": "var(--font-serif-loaded), ui-serif, Georgia, serif",
          "--font-sans":
            "var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-mono-loaded), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
