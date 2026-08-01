/**
 * OG image generation for link previews.
 *
 * Rendered on demand from the page's own content, so it can never fall out of
 * date with the page — which is what happens with a generated-and-stored image
 * the moment a founder edits their headline. `next/og` is Next's built-in
 * Satori renderer, so no extra dependency and no object storage is involved.
 */

import { ImageResponse } from "next/og";
import { listBySlug, listCounters } from "@/lib/lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const list = await listBySlug((await params).slug);
  if (!list) return new Response("not found", { status: 404 });

  const counters = await listCounters(list.id);
  const joined = counters.active + counters.review + counters.unsubscribed;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: list.theme.ground,
          color: "#EEF1FB",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: list.theme.accent,
            fontWeight: 600,
          }}
        >
          {list.name}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: list.headline.length > 60 ? 60 : 76,
              lineHeight: 1.06,
              fontWeight: 700,
              letterSpacing: -1.5,
              maxWidth: 900,
            }}
          >
            {list.headline}
          </div>
          {list.subhead ? (
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 28,
                lineHeight: 1.45,
                color: "#8C93B8",
                maxWidth: 820,
              }}
            >
              {list.subhead.slice(0, 160)}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #232B4D",
            paddingTop: 28,
            fontSize: 22,
          }}
        >
          <div style={{ display: "flex", color: "#8C93B8" }}>
            {joined === 0
              ? "The queue starts with you"
              : `${joined.toLocaleString("en-US")} ${joined === 1 ? "person" : "people"} in line`}
          </div>
          {list.badgeHidden ? null : (
            <div style={{ display: "flex", color: "#585F88", letterSpacing: 1.5 }}>LAUNCHLIST</div>
          )}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
