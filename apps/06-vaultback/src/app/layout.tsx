import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, per DESIGN.md: Archivo for display and UI, IBM Plex Mono for the
 * artifacts of proof. `next/font` self-hosts the woff2 and emits the preload
 * links, so there is no silent system-font fallback — DESIGN.md counts that as a
 * failed build.
 */
const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VaultBack — verified backups for hosted Postgres",
    template: "%s · VaultBack",
  },
  description:
    "Automated encrypted backups for Supabase, Neon, Railway and any Postgres — plus scheduled restore drills that prove the backups actually restore.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3006"),
};

export const viewport: Viewport = {
  themeColor: "#0f1214",
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
          "--font-sans": `var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          "--font-mono": `var(--font-mono-loaded), ui-monospace, Menlo, monospace`,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
