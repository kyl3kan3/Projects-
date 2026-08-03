import type { Metadata, Viewport } from "next";
import { Archivo, Fragment_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Archivo (including its width axis, so the display
 * role is genuinely SemiExpanded rather than letter-spaced) for display, UI and
 * body; Fragment Mono for every count, date and requirement figure.
 *
 * `next/font` self-hosts the woff2 and emits the preload links, so there is no
 * silent system-font fallback — DESIGN_LANGUAGE.md rule 7 counts that as a
 * failed build.
 */
const sans = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = Fragment_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MatPass — every stripe earned, on the wall and on record",
    template: "%s · MatPass",
  },
  description:
    "Martial-arts school management built on the progression ledger: belt and stripe tracking per curriculum, kiosk check-in at the door, grading events that assemble their own eligibility list, family memberships on Stripe, and retention flags before a quiet student becomes a quit student.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3057"),
};

export const viewport: Viewport = {
  themeColor: "#f6f5f1",
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
          "--font-display": `var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-sans": `var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-mono": `var(--font-mono-loaded), ui-monospace, Menlo, monospace`,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
