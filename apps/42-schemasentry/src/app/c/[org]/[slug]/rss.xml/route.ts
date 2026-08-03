/**
 * The changelog's RSS feed.
 *
 * Hand-built XML rather than a library: the document is six tags, and the only
 * thing that can go wrong is escaping — which is done once, here, for every
 * interpolated value. An unescaped `&` in a customer's title would make the whole
 * feed unparseable in every reader.
 */

import { NextResponse } from "next/server";
import { getPublicChangelog } from "@/lib/queries";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org: orgSlug, slug } = await params;
  const data = await getPublicChangelog(orgSlug, slug);
  if (!data) {
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }

  const pageUrl = `${env.appUrl}/c/${data.org.slug}/${data.api.slug}`;
  const feedUrl = `${pageUrl}/rss.xml`;
  const lastBuild = data.entries[0]?.publishedAt ?? new Date();

  const items = data.entries
    .map((entry) => {
      const link = `${pageUrl}#${entry.anchor}`;
      const title = `${entry.breaking ? "Breaking: " : ""}${entry.title}`;
      return [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(entry.id)}</guid>`,
        `      <pubDate>${(entry.publishedAt ?? entry.createdAt).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(entry.bodyMd)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${data.api.name} changelog`)}</title>`,
    `    <link>${escapeXml(pageUrl)}</link>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(`Breaking changes and migration notes for ${data.api.name}.`)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>`,
    "    <generator>SchemaSentry</generator>",
    items,
    "  </channel>",
    "</rss>",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
