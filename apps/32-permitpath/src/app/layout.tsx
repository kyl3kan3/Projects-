import type { Metadata, Viewport } from "next";
import { Public_Sans, Source_Serif_4, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Source Serif 4 for display and screen titles (the
 * typeface of an ordinance), Public Sans for UI and body, Spline Sans Mono for
 * every permit number, fee, date and recency stamp. `next/font` self-hosts the
 * woff2 and emits the preload links, so there is no silent system-font fallback —
 * DESIGN_LANGUAGE.md rule 7 counts that as a failed build.
 */
const display = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600"],
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
  weight: ["500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PermitPath — permit intelligence for contractors",
    template: "%s · PermitPath",
  },
  description:
    "Know what every building department requires, and hear about rule changes before they become a $2,000 fine and a stopped job.",
  metadataBase: new URL(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3032",
  ),
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#f1ebdd",
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
          "--font-display": "var(--font-display-loaded), ui-serif, Georgia, serif",
          "--font-sans": "var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-mono-loaded), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
