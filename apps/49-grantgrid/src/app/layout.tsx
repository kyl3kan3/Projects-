import type { Metadata, Viewport } from "next";
import { Albert_Sans, Fraunces, Red_Hat_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Fraunces for the stationery voice (display only),
 * Albert Sans for the UI, Red Hat Mono for every date, dollar figure, EIN and
 * score. `next/font/google` self-hosts the woff2 files and emits the preload
 * links, so there is no silent fallback to a system font — DESIGN.md counts that
 * as a failed build.
 */
const display = Fraunces({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = Albert_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = Red_Hat_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GrantGrid — the grant pipeline for small nonprofits",
    template: "%s · GrantGrid",
  },
  description:
    "Grant pipeline, deadline calendar, fit-scored discovery and a reusable answer library — so a two-person nonprofit runs grants like a development office.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3049"),
  // Served from public/ rather than as an app-dir metadata file: the generated
  // route did not resolve under `next start` here, and a 404 in the console of
  // every page is not a thing to ship.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#f6f3ea",
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
