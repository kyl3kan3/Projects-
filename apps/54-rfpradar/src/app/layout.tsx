import type { Metadata, Viewport } from "next";
import { Overpass_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Public Sans (the USWDS face — civic without
 * stiffness, and native to this product's world) for display and UI, Overpass
 * Mono for every notice id, deadline, fit score and value band.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so
 * there is no silent system-font fallback — DESIGN_LANGUAGE.md rule 7 counts that
 * as a failed build, and a stylesheet link to a font CDN would have been exactly
 * that on a partner's hotel wifi at 6am.
 */
const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = Overpass_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RFPRadar — the tender you'd have missed, found at 6am",
    template: "%s · RFPRadar",
  },
  description:
    "RFP and tender discovery plus a response workspace for agencies and B2B services firms: SAM.gov and state portal feeds scored against your keyword profiles with visible reasons, one deadline calendar, go/no-go scorecards, and an answer library instead of a blank page.",
  metadataBase: new URL(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3054",
  ),
  applicationName: "RFPRadar",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "RFPRadar", statusBarStyle: "default" },
  openGraph: {
    title: "The tender you'd have missed, found at 6am.",
    description:
      "Every relevant tender found at 6am, scored with reasons, and answered from a library instead of a blank page.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f6f4",
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
