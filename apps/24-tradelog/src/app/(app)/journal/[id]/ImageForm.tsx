"use client";

import { useActionState } from "react";
import { addTradeImageAction, deleteTradeImageAction, type TradeFormState } from "../actions";
import { IconCamera, IconTrash } from "@/components/icons";

export function ImageForm({
  tradeId,
  images,
  allowed,
}: {
  tradeId: string;
  images: { id: string; caption: string | null; byteSize: number }[];
  allowed: boolean;
}) {
  const [state, formAction, pending] = useActionState<TradeFormState, FormData>(
    addTradeImageAction,
    {},
  );

  return (
    <section>
      <h2 className="t-label mb-3">Chart snapshots</h2>

      {images.length ? (
        <ul className="mb-4 flex flex-col gap-4">
          {images.map((image) => (
            <li key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/trade-images/${image.id}`}
                alt={image.caption ?? "Chart snapshot for this trade"}
                className="w-full rounded-[10px] border border-[var(--color-hairline)]"
              />
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="t-secondary">
                  {image.caption ?? "No caption"} · {Math.round(image.byteSize / 1024)} KB
                </span>
                <form action={() => deleteTradeImageAction(image.id)}>
                  <button type="submit" className="btn-quiet flex items-center gap-1">
                    <IconTrash size={14} />
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {allowed ? (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="tradeId" value={tradeId} />
          <input
            className="input py-2"
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
          />
          <input className="input" name="caption" placeholder="Caption — what were you looking at?" />
          {state.error ? (
            <p className="t-secondary" style={{ color: "var(--color-loss)" }} role="alert">
              {state.error}
            </p>
          ) : null}
          <button className="btn btn-secondary" type="submit" disabled={pending}>
            <IconCamera size={16} />
            {pending ? "Uploading…" : "Attach a snapshot"}
          </button>
        </form>
      ) : (
        <p className="t-secondary">
          Chart snapshots are a Trader feature — $19/mo, unlimited trades and images.
        </p>
      )}
    </section>
  );
}
