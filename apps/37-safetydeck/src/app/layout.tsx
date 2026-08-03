import type { Metadata, Viewport } from "next";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Barlow (DIN-descended, made for signage) for display
 * and UI, IBM Plex Mono for every timestamp, count, case number and expiry date.
 *
 * `next/font` self-hosts the woff2 and emits the preload links at build time, so
 * there is no runtime network request and no silent system-font fallback —
 * DESIGN_LANGUAGE.md rule 7 counts that as a failed build.
 */
const sans = Barlow({
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
    default: "SafetyDeck — the signature that beats the citation",
    template: "%s · SafetyDeck",
  },
  description:
    "Toolbox talks with on-phone crew sign-off, an incident log that produces correct OSHA 300/300A output, and a cert-expiry tracker — so the paperwork exists when the inspector asks.",
  metadataBase: new URL(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3037",
  ),
  applicationName: "SafetyDeck",
  // Declared explicitly from public/ rather than via the app/icon convention:
  // the generated route sits behind this app's middleware matcher and would
  // leave a favicon 404 in every page's console.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#17150f",
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
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
