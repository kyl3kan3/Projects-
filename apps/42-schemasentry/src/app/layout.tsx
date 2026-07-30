import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SchemaSentry",
  description:
    "SchemaSentry is the breaking-change watchdog for your API: it diffs your OpenAPI spec (or observed traffic shapes) between deploys, fails the CI check and pings Slack when a change would break consumers, auto-generates contract tests, and publishes a changelog page your API consumers actually read.",
};

export const viewport: Viewport = {
  themeColor: "#121417",
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
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
