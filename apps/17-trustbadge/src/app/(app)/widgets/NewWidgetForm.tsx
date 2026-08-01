"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { IconPlus } from "@/components/icons";
import { createWidgetAction, type WidgetFormState } from "./actions";
import type { WidgetType } from "@/db/schema";

const OPTIONS: { type: WidgetType; label: string; blurb: string }[] = [
  { type: "wall", label: "Reviews wall", blurb: "Masonry grid, 1–4 columns, fits its slot." },
  { type: "carousel", label: "Carousel", blurb: "One row, arrows and swipe." },
  { type: "badge", label: "Badge", blurb: "Score, stars, verified count." },
  { type: "stars", label: "Star snippet", blurb: "Inline stars for collection tiles." },
];

export function NewWidgetForm({ allowed }: { allowed: WidgetType[] }) {
  const [state, formAction, pending] = useActionState<WidgetFormState, FormData>(
    createWidgetAction,
    {},
  );
  const [type, setType] = useState<WidgetType>(allowed.includes("wall") ? "wall" : "badge");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="type" value={type} />

      <fieldset className="flex flex-col gap-0">
        <legend className="t-label mb-2">Widget type</legend>
        {OPTIONS.map((option) => {
          const locked = !allowed.includes(option.type);
          return (
            <label
              key={option.type}
              className="row cursor-pointer"
              style={{ opacity: locked ? 0.55 : 1 }}
            >
              <input
                type="radio"
                name="typeChoice"
                className="sr-only"
                checked={type === option.type}
                disabled={locked}
                onChange={() => setType(option.type)}
              />
              <span
                aria-hidden="true"
                className="inline-block shrink-0 rounded-full"
                style={{
                  width: 16,
                  height: 16,
                  border: `1px solid ${type === option.type ? "var(--color-gold)" : "var(--color-hairline)"}`,
                  boxShadow:
                    type === option.type ? "inset 0 0 0 3px var(--color-daylight)" : undefined,
                  background: type === option.type ? "var(--color-gold)" : "transparent",
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="t-title block">{option.label}</span>
                <span className="t-secondary block">
                  {locked ? "Not on your plan — Free includes the badge." : option.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="t-label">Name it</span>
        <input className="input" name="name" placeholder="Product page carousel" maxLength={60} />
      </label>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}{" "}
          {state.requiredTier ? (
            <Link href="/settings/billing" style={{ color: "var(--color-gold)" }}>
              See plans
            </Link>
          ) : null}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconPlus size={18} />
        {pending ? "Creating…" : "Create widget"}
      </button>
    </form>
  );
}
