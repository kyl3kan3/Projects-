import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Source Serif 4 for display (this product is fine
 * business stationery, and the letterhead is set in a serif), Public Sans for UI,
 * IBM Plex Mono for every amount, date and day count.
 *
 * next/font self-hosts the woff2 and emits the preload links at build time, so
 * there is no network request at runtime and no silent system-font fallback.
 */
const display = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-display-loaded",
  display: "swap",
});

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
    default: "PaidWell — get paid without chasing",
    template: "%s · PaidWell",
  },
  description:
    "Accounts-receivable autopilot for agencies and service firms: polite, escalating invoice follow-up in your firm's voice, a client payment portal, and a cash-flow forecast you can actually trust.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3043"),
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
