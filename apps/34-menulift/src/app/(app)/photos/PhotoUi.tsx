"use client";

import { useActionState, useState } from "react";
import {
  approvePhotoAction,
  deletePhotoAction,
  rejectPhotoAction,
  uploadPhotoAction,
} from "./actions";
import { EMPTY_PHOTO_STATE } from "./state";
import { IconCamera, IconCheck, IconTrash } from "@/components/icons";

export interface DishOption {
  id: string;
  name: string;
  sectionName: string;
}

export interface CardView {
  photoId: string;
  itemName: string;
  sectionName: string;
  status: string;
  note: string | null;
  error: string | null;
  provider: string | null;
  originalUrl: string;
  enhancedUrl: string | null;
  /** "Shot 6:10pm · enhanced in 41s" — assembled server-side, in local time. */
  caption: string;
}

function Feedback({ state }: { state: { error: string | null; ok: string | null } }) {
  if (!state.error && !state.ok) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{ margin: 0, color: state.error ? "#c05a3e" : "#5f7e4e" }}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export function UploadForm({ dishes }: { dishes: DishOption[] }) {
  const [state, action, pending] = useActionState(uploadPhotoAction, EMPTY_PHOTO_STATE);
  const [filename, setFilename] = useState<string | null>(null);

  if (!dishes.length) {
    return (
      <p className="t-secondary" style={{ margin: 0 }}>
        Add a dish first — a photo needs something to be a photo of.
      </p>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Dish</span>
        <select className="select" name="itemId" required defaultValue="">
          <option value="" disabled>
            Pick a dish
          </option>
          {dishes.map((dish) => (
            <option key={dish.id} value={dish.id}>
              {dish.sectionName} — {dish.name}
            </option>
          ))}
        </select>
      </label>

      <label className="btn btn-secondary btn-block" style={{ cursor: "pointer" }}>
        <IconCamera size={20} />
        {filename ? filename : "Take or choose a photo"}
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp,image/heic"
          capture="environment"
          required
          onChange={(event) => setFilename(event.currentTarget.files?.[0]?.name ?? null)}
          style={{ display: "none" }}
        />
      </label>

      <Feedback state={state} />

      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending ? "Enhancing…" : "Enhance it"}
      </button>
      <p className="t-secondary" style={{ margin: 0 }}>
        Nothing goes on the guest menu until you approve it.
      </p>
    </form>
  );
}

/**
 * The before/after review card — the one true card in this product.
 *
 * The slider tracks the finger 1:1 with no easing (a tool, not a toy), and it is
 * a real `<input type="range">` so it is keyboard- and screen-reader-operable.
 * With reduced motion the transition is instant, and the two Labels
 * ("PHONE SNAP" / "ENHANCED") always say which side is which.
 */
export function ReviewCard({ card }: { card: CardView }) {
  const [split, setSplit] = useState(55);
  const [approveState, approveAction, approving] = useActionState(approvePhotoAction, EMPTY_PHOTO_STATE);
  const [rejectState, rejectAction] = useActionState(rejectPhotoAction, EMPTY_PHOTO_STATE);

  const failed = card.status === "failed";

  return (
    <article className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h3 className="t-dish" style={{ margin: 0 }}>
          {card.itemName}
        </h3>
        <span className="t-label">{card.sectionName}</span>
        {failed ? (
          <span className="pill pill-86">
            <span className="pill-dot" />
            Retake
          </span>
        ) : (
          <span className="pill pill-enhancing">
            <span className="pill-dot" />
            Awaiting review
          </span>
        )}
      </div>

      {failed || !card.enhancedUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.originalUrl} alt={`${card.itemName}, as shot`} className="photo" style={{ width: "100%", aspectRatio: "4 / 3" }} />
          <p className="t-body" style={{ margin: 0, color: "#b8863b" }}>
            {card.error ?? "The enhancement pass could not finish on that photo."}
          </p>
        </>
      ) : (
        <>
          <div className="split">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.enhancedUrl} alt={`${card.itemName}, enhanced`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.originalUrl}
              alt={`${card.itemName}, phone snap`}
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <span className="split-handle" style={{ left: `${split}%` }} aria-hidden />
            <input
              className="split-range"
              type="range"
              min={0}
              max={100}
              value={split}
              aria-label={`Compare ${card.itemName}: phone snap versus enhanced`}
              onChange={(event) => setSplit(Number(event.currentTarget.value))}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="t-label">Phone snap</span>
            <span className="t-label">Enhanced</span>
          </div>
          {card.note ? (
            <p className="t-secondary" style={{ margin: 0 }}>
              {card.note}
            </p>
          ) : null}
        </>
      )}

      <p className="t-data" style={{ margin: 0, color: "var(--fg-2)" }}>
        {card.caption}
      </p>

      <Feedback state={approveState} />
      <Feedback state={rejectState} />

      <div style={{ display: "grid", gap: 8 }}>
        {!failed && card.enhancedUrl ? (
          <form action={approveAction}>
            <input type="hidden" name="photoId" value={card.photoId} />
            <button className="btn btn-primary btn-block" type="submit" disabled={approving}>
              <IconCheck size={18} /> {approving ? "Publishing…" : "Approve photo"}
            </button>
          </form>
        ) : null}
        <form action={rejectAction}>
          <input type="hidden" name="photoId" value={card.photoId} />
          <button className="btn btn-secondary btn-block" type="submit">
            Retake
          </button>
        </form>
      </div>
    </article>
  );
}

export function LivePhotoRow({ card }: { card: CardView }) {
  const [state, action] = useActionState(deletePhotoAction, EMPTY_PHOTO_STATE);
  return (
    <li className="row" style={{ alignItems: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.enhancedUrl ?? card.originalUrl}
        alt=""
        className="photo"
        style={{ width: 64, height: 64, flex: "0 0 auto" }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="t-dish" style={{ margin: 0 }}>
          {card.itemName}
        </p>
        <p className="t-data" style={{ margin: 0, marginTop: 2, color: "var(--fg-2)" }}>
          {card.caption}
        </p>
        {state.error ? (
          <p className="t-secondary" role="alert" style={{ margin: 0, color: "#c05a3e" }}>
            {state.error}
          </p>
        ) : null}
      </div>
      <form action={action}>
        <input type="hidden" name="photoId" value={card.photoId} />
        <button className="toggle-86" type="submit" aria-label={`Remove the photo for ${card.itemName}`}>
          <IconTrash size={18} />
        </button>
      </form>
    </li>
  );
}
