import type { Metadata, Viewport } from "next";
import { Fraunces, Public_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Fraunces for display and dish names (optical size
 * on), Public Sans for UI, Spline Sans Mono for every price and count.
 *
 * `next/font` self-hosts the woff2 and emits the preload links, so there is no
 * silent system-font fallback — DESIGN_LANGUAGE.md rule 7 counts that as a
 * failed build.
 */
const display = Fraunces({
  subsets: ["latin"],
  // Variable across weight *and* the optical-size axis DESIGN.md asks for, which
  // means no fixed `weight` list: 400/500/600 all come from the one file.
  weight: "variable",
  axes: ["SOFT", "WONK"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MenuLift — QR menus, one-tap 86ing, and the margin math",
    template: "%s · MenuLift",
  },
  description:
    "A QR menu that loads before the water arrives, one-tap 86ing that reaches every phone in seconds, and the stars/plowhorses/puzzles/dogs matrix from a POS export. $29-79 per location.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3034"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe3" },
    { media: "(prefers-color-scheme: dark)", color: "#191411" },
  ],
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
          "--font-display": `var(--font-display-loaded), ui-serif, Georgia, serif`,
          "--font-sans": `var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-mono": `var(--font-mono-loaded), ui-monospace, Menlo, monospace`,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
