import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClipForge — one upload, a week of content",
  description:
    "Turn one long-form video or podcast into clips, tweet threads, LinkedIn posts, and a newsletter draft.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
