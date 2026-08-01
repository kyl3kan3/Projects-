import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Hanken Grotesk for display and UI, JetBrains Mono for
 * every amount, date and unit label. next/font self-hosts the woff2 and emits the
 * preload links at build time, so there is no silent system-font fallback — the
 * build brief counts that as a failure.
 */
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    default: "TenantFile — the whole tenancy in one file",
    template: "%s · TenantFile",
  },
  description:
    "The DIY-landlord toolkit for 1–20 units: listing and application intake, tenant screening records, lease e-sign, a rent ledger with reminders, and a maintenance log with photo threads.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3044"),
};

export const viewport: Viewport = {
  themeColor: "#f5f6f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
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
