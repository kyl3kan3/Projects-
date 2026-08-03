import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Libre_Franklin } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Libre Franklin (the American-document grotesk — forms
 * and filings, zero startup flavour) for display and UI, IBM Plex Mono for every
 * limit, policy number, date and hash.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so
 * there is no silent fallback to the system UI font — DESIGN.md counts that as a
 * failed build, and a stylesheet link to a font CDN would have been exactly that.
 */
const sans = Libre_Franklin({
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
    default: "CertShield — expired COIs caught before the claim",
    template: "%s · CertShield",
  },
  description:
    "Certificate-of-insurance tracking for property managers and GCs. Every certificate parsed into structured coverage, checked against the requirement it must meet, and chased automatically before it lapses.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3062"),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f1f2f0",
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
