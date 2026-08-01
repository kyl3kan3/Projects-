import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/**
 * Three faces, per DESIGN.md: Source Serif 4 for documents and display (this is
 * a stationery product — the paper is set in a serif), Inter for UI chrome,
 * JetBrains Mono for dashboard money. next/font self-hosts the woff2 and emits
 * the preload links, so there is no silent system-font fallback.
 */
const display = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PaperTrail — proposals, contracts and invoices for freelancers",
    template: "%s · PaperTrail",
  },
  description:
    "One document chain: proposal, contract, and invoice linked end to end, with e-signature and the deposit invoice raised the moment a contract is signed.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: "#f8f5ef",
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
