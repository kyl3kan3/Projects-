import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { THEME_COLOR } from "@/lib/theme";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Hanken Grotesk (humanist grotesque — warm enough for a
 * service trade, sharp enough for money) for display, UI and body; JetBrains Mono for
 * every price, time, phone number and ledger line.
 *
 * `next/font` self-hosts the woff2 at build time and emits the preload links, so there is
 * no silent fallback to the system UI font — DESIGN.md counts that as a failed build, and
 * a stylesheet link to a font CDN would have been exactly that.
 */
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ChairFlow — the no-show that paid for itself",
    template: "%s · ChairFlow",
  },
  description:
    "Booking and no-show protection for chair-renting stylists and barbers: a personal booking page with card-on-file deposits that convert to no-show fees under your own policy, rebooking nudges timed to each client's real cadence, and chair-rent split tracking for the shop owner.",
  metadataBase: new URL(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3058",
  ),
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
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
