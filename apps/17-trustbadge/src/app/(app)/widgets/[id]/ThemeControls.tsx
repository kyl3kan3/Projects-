"use client";

/**
 * Widget theme tokens as hairline rows, per DESIGN.md: radius, star colour, font,
 * motion, and what the widget shows. Not a settings panel in a box — rows on the
 * daylight ground, under the live instance they change.
 */

import { useState } from "react";
import { IconStar } from "@/components/icons";
import type { WidgetLayout, WidgetTheme, WidgetType } from "@/db/schema";
import { updateWidgetAction } from "../actions";

const STAR_COLORS = [
  { hex: "#e09112", label: "TrustBadge gold" },
  { hex: "#221c13", label: "Ink" },
  { hex: "#3b9e6b", label: "Leaf" },
  { hex: "#c4453c", label: "Red" },
];

export function ThemeControls({
  widgetId,
  type,
  theme,
  layout,
  showBranding,
  brandingLocked,
  brandingLockReason,
}: {
  widgetId: string;
  type: WidgetType;
  theme: WidgetTheme;
  layout: WidgetLayout;
  showBranding: boolean;
  brandingLocked: boolean;
  brandingLockReason: string;
}) {
  const [starColor, setStarColor] = useState(theme.starColor);
  const [radius, setRadius] = useState(theme.radius);
  const showsReviews = type === "wall" || type === "carousel";

  return (
    <form action={updateWidgetAction}>
      <input type="hidden" name="id" value={widgetId} />
      <input type="hidden" name="starColor" value={starColor} />
      <input type="hidden" name="radius" value={radius} />

      <div className="row">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Star colour</span>
          <span className="t-secondary block">
            The one place colour appears in the widget at all.
          </span>
        </span>
        {/* Each option is a drawn star in the candidate colour, not a filled
            swatch — gold never fills a control (DESIGN.md), and a star is what
            the merchant is actually choosing the colour of. */}
        <span className="flex gap-1">
          {STAR_COLORS.map((option) => (
            <button
              key={option.hex}
              type="button"
              aria-label={option.label}
              aria-pressed={starColor === option.hex}
              onClick={() => setStarColor(option.hex)}
              className="inline-flex shrink-0 items-center justify-center"
              style={{
                width: 44,
                height: 44,
                border: "none",
                background: "none",
                borderRadius: 10,
                color: option.hex,
                boxShadow:
                  starColor === option.hex ? "inset 0 0 0 1px var(--color-ink)" : undefined,
              }}
            >
              <IconStar size={20} />
            </button>
          ))}
        </span>
      </div>

      <div className="row">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Corner radius</span>
          <span className="t-secondary block">Match your theme&apos;s cards.</span>
        </span>
        <span className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={24}
            step={2}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
            aria-label="Corner radius in pixels"
            style={{ width: 120, accentColor: "var(--color-ink)" }}
          />
          <span className="t-data" style={{ minWidth: 34, textAlign: "right" }}>
            {radius}px
          </span>
        </span>
      </div>

      <label className="row cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Font</span>
          <span className="t-secondary block">
            Inherit your storefront&apos;s type, or use ours.
          </span>
        </span>
        <select className="input" name="font" defaultValue={theme.font} style={{ width: 160 }}>
          <option value="merchant">Your store&apos;s</option>
          <option value="trustbadge">TrustBadge</option>
        </select>
      </label>

      <label className="row cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Reveal animation</span>
          <span className="t-secondary block">
            Cards settle in and stars fill. Off is a complete widget, not a lesser one.
          </span>
        </span>
        <input
          type="checkbox"
          name="motion"
          defaultChecked={theme.motion}
          style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
        />
      </label>

      {showsReviews ? (
        <>
          <label className="row cursor-pointer">
            <span className="min-w-0 flex-1">
              <span className="t-title block">Reviews shown</span>
              <span className="t-secondary block">
                More reviews mean a taller reserved box, so the snippet grows too.
              </span>
            </span>
            <input
              className="input"
              type="number"
              name="maxReviews"
              min={1}
              max={48}
              defaultValue={layout.maxReviews}
              style={{ width: 88 }}
            />
          </label>

          <label className="row cursor-pointer">
            <span className="min-w-0 flex-1">
              <span className="t-title block">Photos</span>
              <span className="t-secondary block">Lazy-loaded, with real dimensions set.</span>
            </span>
            <input
              type="checkbox"
              name="showPhotos"
              defaultChecked={layout.showPhotos}
              style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
            />
          </label>

          <label className="row cursor-pointer">
            <span className="min-w-0 flex-1">
              <span className="t-title block">Your replies</span>
              <span className="t-secondary block">Shown under the review they answer.</span>
            </span>
            <input
              type="checkbox"
              name="showReplies"
              defaultChecked={layout.showReplies}
              style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
            />
          </label>
        </>
      ) : null}

      <label className="row cursor-pointer" style={{ opacity: brandingLocked ? 0.6 : 1 }}>
        <span className="min-w-0 flex-1">
          <span className="t-title block">&ldquo;Reviews by TrustBadge&rdquo;</span>
          <span className="t-secondary block">{brandingLockReason}</span>
        </span>
        <input
          type="checkbox"
          name="showBranding"
          defaultChecked={showBranding}
          disabled={brandingLocked}
          style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
        />
      </label>

      <button className="btn btn-primary btn-full mt-6" type="submit">
        Save and republish
      </button>
      <p className="t-secondary mt-2">
        Saving purges the edge cache for this store, so your storefront updates in seconds rather
        than at the end of the five-minute window.
      </p>
    </form>
  );
}
