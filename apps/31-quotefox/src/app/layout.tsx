import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Archivo for display and UI (its grotesque width holds
 * up at jobsite glance distance), IBM Plex Mono for every figure and amount.
 *
 * next/font self-hosts the woff2 and emits the preload links at build time, so
 * there is no runtime font request and no silent fallback to a system font —
 * DESIGN.md counts that as a failed build.
 */
const display = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display-loaded",
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
    default: "QuoteFox — send the bid from the driveway",
    template: "%s · QuoteFox",
  },
  description:
    "Walk the job narrating on your phone, snap photos, and send a priced, branded, e-acceptable proposal before you pull out of the driveway — priced from your own price book, never a guess.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3031"),
  applicationName: "QuoteFox",
};

export const viewport: Viewport = {
  themeColor: "#16120d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
