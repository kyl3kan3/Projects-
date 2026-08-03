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

/** Longest edge we send. Above the 1280×960 the pipeline crops to, with headroom. */
const MAX_UPLOAD_EDGE = 1920;
/**
 * What a server action will accept. Must stay at or below
 * `serverActions.bodySizeLimit` in next.config.ts — and below the hosting
 * platform's own request-body ceiling, which on Vercel is 4.5MB no matter what
 * Next is configured to allow.
 */
const MAX_POST_BYTES = 4 * 1024 * 1024;

/**
 * Shrink a phone photo in the browser before posting it.
 *
 * This is not an optimisation, it is the difference between the feature working
 * and not: a modern phone shoots 8–12MB, and a Next server action rejects a body
 * over its limit with a 413 that surfaces as a blank error page — no message, no
 * retry, nothing the owner can act on. Downscaling to 1920px long edge puts a
 * typical dish photo at 300–700KB, which also makes the upload quick on the wifi
 * a restaurant actually has.
 *
 * `imageOrientation: "from-image"` bakes in EXIF rotation, so a portrait photo
 * doesn't arrive sideways once the metadata is dropped.
 *
 * Anything the browser can't decode (HEIC on most desktops) is passed through
 * untouched and size-checked instead — better an honest "too large, shoot as
 * JPEG" than a silent failure.
 */
async function prepareForUpload(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_UPLOAD_EDGE / longest);
    if (scale === 1 && file.size <= 1_000_000) {
      bitmap.close?.();
      return file;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function UploadForm({ dishes }: { dishes: DishOption[] }) {
  const [state, action, pending] = useActionState(uploadPhotoAction, EMPTY_PHOTO_STATE);
  const [file, setFile] = useState<File | null>(null);
  const [itemId, setItemId] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!dishes.length) {
    return (
      <p className="t-secondary" style={{ margin: 0 }}>
        Add a dish first — a photo needs something to be a photo of.
      </p>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (!itemId) {
      setLocalError("Pick a dish for the photo");
      return;
    }
    if (!file) {
      setLocalError("Choose a photo to upload");
      return;
    }

    setPreparing(true);
    const prepared = await prepareForUpload(file);
    setPreparing(false);

    if (prepared.size > MAX_POST_BYTES) {
      setLocalError(
        `That file is still ${(prepared.size / 1_048_576).toFixed(1)}MB after resizing — we can't send more than ${
          MAX_POST_BYTES / 1_048_576
        }MB. Shoot it as JPEG rather than HEIC and try again.`,
      );
      return;
    }

    const payload = new FormData();
    payload.set("itemId", itemId);
    payload.set("photo", prepared, prepared.name);
    action(payload);
  };

  const busy = pending || preparing;

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Dish</span>
        <select
          className="select"
          name="itemId"
          required
          value={itemId}
          onChange={(event) => setItemId(event.currentTarget.value)}
        >
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
        {file ? file.name : "Take or choose a photo"}
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp,image/heic"
          capture="environment"
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            setLocalError(null);
          }}
          style={{ display: "none" }}
        />
      </label>

      {localError ? (
        <p className="t-secondary" role="alert" style={{ margin: 0, color: "#c05a3e" }}>
          {localError}
        </p>
      ) : (
        <Feedback state={state} />
      )}

      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {preparing ? "Resizing…" : pending ? "Enhancing…" : "Enhance it"}
      </button>
      <p className="t-secondary" style={{ margin: 0 }}>
        Big photos are resized in your browser before upload. Nothing goes on the guest menu until you
        approve it.
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
