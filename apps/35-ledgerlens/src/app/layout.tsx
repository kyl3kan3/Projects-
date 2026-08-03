import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Public Sans for UI, IBM Plex Mono for every figure, date
 * and total. `next/font` self-hosts the woff2 and emits the preload links, so there is
 * no silent system-font fallback — DESIGN_LANGUAGE.md rule 7 counts that as a failed
 * build.
 */
const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
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
    default: "LedgerLens — the shoebox, closed by the 3rd",
    template: "%s · LedgerLens",
  },
  description:
    "Forward an invoice, photo a receipt, and hand your accountant a clean monthly close package they actually want. Not accounting software — the thing that feeds one.",
  metadataBase: new URL(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3035",
  ),
  applicationName: "LedgerLens",
  // Declared explicitly rather than through the app/icon convention: the generated
  // route sits behind this app's middleware matcher and a 404 favicon shows up in
  // every page's console.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "LedgerLens", statusBarStyle: "default" },
  openGraph: {
    title: "LedgerLens — the shoebox, closed by the 3rd",
    description:
      "Pre-accounting for solo operators. Forward it or photo it; your accountant gets a clean close package every month.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f1",
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
