import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallDesk",
  description:
    "Dental patient reactivation that pays for itself: import your patient list from any PMS (Dentrix, Eaglesoft, Open Dental exports), see exactly who is overdue for hygiene recall, run email/SMS campaigns with booking links, and get a conservative, receipts-attached count of the production dollars you ",
};

export const viewport: Viewport = {
  themeColor: "#f4f6f7",
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
        <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
