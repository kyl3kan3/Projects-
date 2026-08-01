import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Space Grotesk for display and the position
 * numeral, Inter for UI, IBM Plex Mono for counts. next/font self-hosts the
 * woff2 and emits the preload links, so there is no silent system-font
 * fallback — DESIGN.md counts that as a failed build.
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
  weight: ["500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LaunchList — a waitlist that grows itself",
    template: "%s · LaunchList",
  },
  description:
    'Waitlist and launch-page builder with referral mechanics built in — turn "coming soon" into a growth loop.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3015"),
};

export const viewport: Viewport = {
  themeColor: "#0a0e1f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
      style={
        {
          "--font-display": "var(--font-display-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-sans": "var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-mono-loaded), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
