"use client";

/**
 * The shopper's review form: one question per screen, under 45 seconds.
 *
 * DESIGN.md's shopper spec, exactly — 44px star tap zones with a gold ring pulse
 * on select, then the text, then the photo, then the incentive code sliding down
 * like a receipt with its FTC disclosure line always attached, whatever the rating.
 *
 * Merchant-branded: the store's name is the only name at the top, because a
 * shopper is doing the merchant a favour, not us.
 */

import { useActionState, useState } from "react";
import { IconCamera, IconCheck, IconChevronLeft, IconStar, IconStarOutline } from "@/components/icons";
import { submitReviewAction, type SubmitState } from "./actions";
import type { LineItem } from "@/db/schema";

type Step = "rating" | "words" | "photo";

export function ReviewForm({
  token,
  storeName,
  lineItems,
  photoAllowed,
  incentiveEnabled,
  incentivePercent,
  defaultName,
}: {
  token: string;
  storeName: string;
  lineItems: LineItem[];
  photoAllowed: boolean;
  incentiveEnabled: boolean;
  incentivePercent: number;
  defaultName: string;
}) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitReviewAction,
    {},
  );
  const [rating, setRating] = useState(0);
  const [justPicked, setJustPicked] = useState(0);
  const [step, setStep] = useState<Step>("rating");
  const [product, setProduct] = useState(lineItems[0]?.externalId ?? "");
  const [photoName, setPhotoName] = useState<string | null>(null);

  if (state.done) {
    return <ThankYou storeName={storeName} done={state.done} />;
  }

  const lastStep: Step = photoAllowed ? "photo" : "words";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating} />
      <input type="hidden" name="productExternalId" value={product} />

      {step !== "rating" ? (
        <button
          type="button"
          className="btn-quiet inline-flex items-center gap-1 self-start"
          onClick={() => setStep(step === "photo" ? "words" : "rating")}
        >
          <IconChevronLeft size={16} />
          Back
        </button>
      ) : null}

      {/* Step 1 — the rating. */}
      <fieldset hidden={step !== "rating"}>
        <legend className="t-h2 mb-1">How did it work out?</legend>
        <p className="t-secondary mb-5">
          Whatever you say goes to {storeName} either way. There is no wrong answer here.
        </p>

        {lineItems.length > 1 ? (
          <label className="mb-5 flex flex-col gap-2">
            <span className="t-label">Which one?</span>
            <select
              className="input"
              value={product}
              onChange={(event) => setProduct(event.target.value)}
            >
              {lineItems.map((item) => (
                <option key={item.externalId} value={item.externalId}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="star-input" role="radiogroup" aria-label="Rating out of five">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className="star-btn"
              data-on={value <= rating}
              data-picked={value === justPicked}
              role="radio"
              aria-checked={value === rating}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              onClick={() => {
                setRating(value);
                setJustPicked(value);
                setTimeout(() => setStep("words"), 220);
              }}
            >
              {value <= rating ? <IconStar size={32} /> : <IconStarOutline size={32} />}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Step 2 — the words. */}
      <fieldset hidden={step !== "words"}>
        <legend className="t-h2 mb-1">What should other people know?</legend>
        <p className="t-secondary mb-5">
          A sentence is plenty. Sizing, fit, how it held up — the practical things.
        </p>

        <label className="mb-4 flex flex-col gap-2">
          <span className="t-label">Headline (optional)</span>
          <input className="input" name="title" maxLength={120} placeholder="Exactly what I hoped for" />
        </label>

        <label className="mb-4 flex flex-col gap-2">
          <span className="t-label">Your review</span>
          <textarea
            className="input"
            name="body"
            maxLength={4000}
            placeholder="Beautiful weight, and it softened after two washes."
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Name shown with the review</span>
          <input className="input" name="authorName" defaultValue={defaultName} maxLength={60} />
        </label>
      </fieldset>

      {/* Step 3 — the photo, and the incentive it earns. */}
      {photoAllowed ? (
        <fieldset hidden={step !== "photo"}>
          <legend className="t-h2 mb-1">Add a photo?</legend>
          <p className="t-secondary mb-5">
            {incentiveEnabled
              ? `Photos help more than words do. Add one and ${storeName} will send you ${incentivePercent}% off your next order — for any photo, whatever you rated it.`
              : "Photos help more than words do, and yours would be the most useful thing on the page."}
          </p>

          <label className="card flex cursor-pointer items-center gap-3 p-4">
            <span style={{ color: "var(--color-text-2)" }}>
              <IconCamera size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-title block">{photoName ?? "Choose a photo"}</span>
              <span className="t-secondary block">JPEG, PNG, or WebP, up to 8MB.</span>
            </span>
            <input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? null)}
            />
          </label>
        </fieldset>
      ) : null}

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {step === "rating" ? (
          <button
            className="btn btn-primary btn-full"
            type="button"
            disabled={rating === 0}
            onClick={() => setStep("words")}
          >
            {rating === 0 ? "Pick a rating" : "Next"}
          </button>
        ) : step === lastStep ? (
          <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send my review"}
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary btn-full"
              type="button"
              onClick={() => setStep("photo")}
            >
              Next
            </button>
            <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send without a photo"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function ThankYou({
  storeName,
  done,
}: {
  storeName: string;
  done: NonNullable<SubmitState["done"]>;
}) {
  return (
    <div>
      <p className="verified mb-3">
        <IconCheck size={16} />
        Sent
      </p>
      <h2 className="t-h2">Thank you — that helps more than you would think.</h2>
      <p className="t-secondary mt-2">
        {done.autoPublished
          ? `Your review is on ${storeName}'s store already.`
          : `${storeName} will read it and publish it shortly.`}
      </p>

      {done.incentiveCode ? (
        <div className="card stack-card mt-6 p-4">
          <p className="t-label">Your code</p>
          <p className="t-data mt-2" style={{ fontSize: 24 }}>
            {done.incentiveCode}
          </p>
          <p className="t-secondary mt-2">{done.percentOff}% off your next order at {storeName}.</p>
          {/* The disclosure is not fine print and is never conditional on the rating. */}
          <p className="t-secondary mt-3">{done.disclosure}</p>
        </div>
      ) : null}
    </div>
  );
}
