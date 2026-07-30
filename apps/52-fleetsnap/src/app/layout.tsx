import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FleetSnap",
  description:
    "Driver vehicle inspection reports (DVIRs) and maintenance tracking for small fleets of 5-50 vehicles: drivers tap through a 90-second pre-trip with photo capture on their phones, defects open maintenance tickets automatically, every vehicle carries its full service history, and compliance exports ar",
};

export const viewport: Viewport = {
  themeColor: "#f5f6f7",
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
        <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Red+Hat+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
