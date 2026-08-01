import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Libre Franklin (the US-forms lineage, worn well) for
 * display and UI, Spline Sans Mono for every amount, date, unit number and issue
 * number. `next/font` self-hosts the woff2 and emits the preload links, so there
 * is no silent system-font fallback — DESIGN_LANGUAGE.md rule 7 counts that as a
 * failed build.
 */
const sans = Libre_Franklin({
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
    default: "DuesDesk — dues, roster, and records for self-managed boards",
    template: "%s · DuesDesk",
  },
  description:
    "Dues invoicing with autopay, a roster that survives board turnover, a violations and requests log with photo threads, and announcements you can prove arrived — for self-managed HOAs, clubs, and leagues.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3038"),
};

export const viewport: Viewport = {
  themeColor: "#f6f7f4",
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
