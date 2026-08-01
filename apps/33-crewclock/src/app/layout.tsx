import type { Metadata, Viewport } from "next";
import { Barlow, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

/**
 * Two faces, per DESIGN.md: Barlow for display and UI (sturdy, built for
 * signage), JetBrains Mono for every hour and dollar. next/font self-hosts the
 * woff2 and emits the preload links, so there is no silent system-font
 * fallback — DESIGN.md counts that as a failed build.
 *
 * `latin-ext` is not optional here: the Spanish half of the product needs
 * á é í ó ú ñ ¿ ¡ in every weight, and the plain `latin` subset clips some of
 * them in some releases.
 */
const barlow = Barlow({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CrewClock — GPS-verified time tracking and job costing for field crews",
    template: "%s · CrewClock",
  },
  description:
    "The timesheet that can't be rounded up — and the job cost you see before the job loses money. Geofenced clock in/out, bilingual EN/ES crew app, live labor cost vs bid, ADP and Gusto payroll exports.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3033"),
  applicationName: "CrewClock",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CrewClock" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#12161a" },
    { media: "(prefers-color-scheme: light)", color: "#f6f8f5" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${jetbrains.variable}`}
      // The loaded faces override the fallback stacks declared in globals.css.
      style={
        {
          "--font-display": "var(--font-barlow), ui-sans-serif, system-ui, sans-serif",
          "--font-sans": "var(--font-barlow), ui-sans-serif, system-ui, sans-serif",
          "--font-mono": "var(--font-jetbrains), ui-monospace, Menlo, monospace",
        } as React.CSSProperties
      }
    >
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
