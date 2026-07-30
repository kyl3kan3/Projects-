import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Space Grotesk for display, Inter for body/UI,
 * IBM Plex Mono for every metric. next/font self-hosts the woff2 and emits the
 * preload links, so there is no silent system-font fallback — DESIGN.md counts
 * that as a failed build.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = Inter({
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
    default: "PulseWatch — uptime and cron monitoring for indie devs",
    template: "%s · PulseWatch",
  },
  description:
    "Uptime, cron-job, and SSL/domain-expiry monitoring with public status pages — priced and built for indie devs and small teams.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: "#070b0a",
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
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
      style={
        {
          "--font-display": `var(--font-display-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-sans": `var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-mono": `var(--font-mono-loaded), ui-monospace, Menlo, monospace`,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
