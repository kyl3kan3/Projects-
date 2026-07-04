import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const instrumentSans = localFont({
  src: [
    { path: "./fonts/instrument-sans-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-sans-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/instrument-sans-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-instrument",
  display: "swap",
  preload: true,
});

const ibmPlexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-600-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Dunly - recover failed payments before they become churn",
  description:
    "Stripe failed-payment recovery, dunning sequences, hosted card-update pages, and honest recovery attribution for small SaaS teams.",
};

export const viewport: Viewport = {
  themeColor: "#101315",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
