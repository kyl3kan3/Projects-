import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Manrope for the UI, JetBrains Mono for every
 * pointer path, endpoint, verdict, version label and diff line — "the mono is
 * the voice of the product".
 *
 * `next/font/google` self-hosts the woff2 files and emits the preload links at
 * build time, so there is no runtime network request and no silent fallback to a
 * system font. DESIGN.md counts that fallback as a failed build.
 */
const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SchemaSentry — the breaking change caught in CI, not prod",
    template: "%s · SchemaSentry",
  },
  description:
    "SchemaSentry diffs your OpenAPI spec between deploys, fails the CI check and pings Slack when a change would break consumers, generates contract tests, and publishes a changelog your API consumers actually read.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3042"),
  // Both are served from `public/`, not as app-dir metadata files. The SVG is
  // what modern browsers use; the .ico is there because a browser asks for
  // `/favicon.ico` regardless, and a 404 in the console of every page is not a
  // thing to ship.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#121417",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
