import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GreenTally",
  description:
    "Carbon reporting for SMBs under supplier pressure: upload your utility bills and a spend CSV, get a defensible Scope 1/2 (+ spend-based Scope 3) footprint, a CSRD-lite PDF, and ready-to-paste answers for CDP/EcoVadis-style questionnaires.",
};

export const viewport: Viewport = {
  themeColor: "#f6f4ed",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
