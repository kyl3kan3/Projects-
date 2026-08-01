import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Public Sans (the US government civic face — earned
 * trust, zero fashion) for display and UI, IBM Plex Mono for every timestamp,
 * hash, score and audit entry.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so
 * there is no silent system-font fallback — DESIGN.md counts that as a failed
 * build, and a stylesheet link to a font CDN would have been exactly that on a
 * clinic's flaky waiting-room wifi.
 */
const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    default: "FormForge — the clipboard, retired",
    template: "%s · FormForge",
  },
  description:
    "Patient intake for therapists and small clinics: structured forms, e-signatures with a hash and a timestamp, encrypted storage, and an audit trail you can read.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3048"),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f7f6f1",
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
