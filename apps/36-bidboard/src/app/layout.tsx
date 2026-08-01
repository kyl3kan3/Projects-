import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Archivo for display and UI, JetBrains Mono for every
 * amount, quantity, date and CSI code. `next/font` self-hosts the woff2 and emits
 * the preload links, so there is no silent system-font fallback — DESIGN.md counts
 * that as a failed build.
 */
const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BidBoard — five bids, leveled on one screen",
    template: "%s · BidBoard",
  },
  description:
    "Subcontractor bid management for small general contractors: invite subs by trade, collect bids through a no-login portal, level them side by side, award and notify — without the midnight spreadsheet.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3036"),
};

export const viewport: Viewport = {
  themeColor: "#14181d",
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
