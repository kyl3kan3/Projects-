import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Archivo for display and UI (a signage grotesk built
 * for wayfinding — nothing like reflexive Inter) and IBM Plex Mono for every
 * rate, mile, timestamp and reference number.
 *
 * `next/font` self-hosts the woff2 and emits the preload links, so there is no
 * silent fall back to the system UI font — DESIGN.md counts that as a failed
 * build.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DispatchDeck — the load delivered, invoiced, and factored by dinner",
    template: "%s · DispatchDeck",
  },
  description:
    "The back office for owner-operator truckers: one load record from booked to paid, with the paperwork packet assembled the moment the BOL is photographed.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3059"),
  applicationName: "DispatchDeck",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DispatchDeck" },
};

export const viewport: Viewport = {
  themeColor: "#16181b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
      style={
        {
          "--font-display": "var(--font-archivo), ui-sans-serif, system-ui, sans-serif",
          "--font-sans": "var(--font-archivo), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-plex-mono), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
