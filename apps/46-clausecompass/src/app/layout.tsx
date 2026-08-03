import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

/**
 * Three voices from one family, per DESIGN.md: the serif is the document's words, the
 * sans is ours, the mono is the citation.
 *
 * `next/font/google` self-hosts the woff2 files and emits the preload links at build
 * time, so there is no runtime request to a font CDN and no silent fallback to a system
 * font — DESIGN.md counts that fallback as a failed build.
 */
const serif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif-loaded",
  display: "swap",
});

const sans = IBM_Plex_Sans({
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
    default: "ClauseCompass — know what you're signing",
    template: "%s · ClauseCompass",
  },
  description:
    "Upload a contract and get every clause extracted, risk-scored against a playbook, explained in plain English, and paired with suggested redline language. Not legal advice, and it says so on every page.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3046"),
  applicationName: "ClauseCompass",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "ClauseCompass", statusBarStyle: "default" },
  openGraph: {
    title: "ClauseCompass — know what you're signing",
    description:
      "Every clause extracted, scored against a playbook, explained in plain English, with redline language you can paste into an email.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf7f1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      style={
        {
          "--font-display": "var(--font-serif-loaded), ui-serif, Georgia, serif",
          "--font-serif": "var(--font-serif-loaded), ui-serif, Georgia, serif",
          "--font-sans": "var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-mono-loaded), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
