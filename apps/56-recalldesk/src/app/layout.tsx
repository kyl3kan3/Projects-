import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Schibsted Grotesk (modern, plainspoken, slightly
 * Scandinavian-clinic) for display, UI and body; IBM Plex Mono for every dollar
 * amount, count, date and phone number.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so
 * there is no silent fallback to the system UI font — DESIGN.md counts that as a
 * failed build, and a stylesheet link to a font CDN would have been exactly that.
 */
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
    default: "RecallDesk — the hygiene chair that fills itself",
    template: "%s · RecallDesk",
  },
  description:
    "Dental patient reactivation with receipts. Import your patient list from any PMS, see exactly who is overdue for hygiene recall, run email and SMS campaigns with booking links, and count recovered production conservatively.",
  metadataBase: new URL(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3056"),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f4f6f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
