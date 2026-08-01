/**
 * A review card, as DESIGN.md specifies it: card fill, hairline, radius 12,
 * padding 16; photo 1:1 on top when there is one; star row plus the leaf-check;
 * body clamped to four lines; reviewer and date in Secondary.
 *
 * Cards exist here and inside widgets, and nowhere else — settings and lists are
 * hairline rows.
 */

import { Stars } from "@/components/Stars";
import { IconCamera, IconLeafCheck } from "@/components/icons";
import { photoUrl } from "@/lib/media";
import { shortDate } from "@/lib/format";
import type { Review, ReviewMediaRow } from "@/db/schema";

const STATUS_LABEL: Record<Review["status"], string> = {
  pending: "Waiting",
  approved: "Published",
  rejected: "Hidden",
};

const STATUS_COLOR: Record<Review["status"], string> = {
  pending: "var(--color-text-2)",
  approved: "var(--color-leaf)",
  rejected: "var(--color-red)",
};

export function ReviewCard({
  review,
  media = [],
  showStatus = false,
  clamp = true,
}: {
  review: Review;
  media?: ReviewMediaRow[];
  showStatus?: boolean;
  clamp?: boolean;
}) {
  const photo = media[0];

  return (
    <article className="card stack-card p-4">
      {photo ? (
        <img
          src={photoUrl(photo)}
          width={photo.width}
          height={photo.height}
          alt={`Photo in a review by ${review.authorName}`}
          loading="lazy"
          decoding="async"
          className="mb-3 block w-full rounded-[10px] object-cover"
          style={{ aspectRatio: "1 / 1", background: "var(--color-hairline)" }}
        />
      ) : null}

      <div className="flex items-center gap-2">
        <Stars value={review.rating} />
        {review.verifiedPurchase ? (
          <span className="verified">
            <IconLeafCheck size={16} />
            Verified buyer
          </span>
        ) : null}
        {showStatus ? (
          <span className="t-label ml-auto" style={{ color: STATUS_COLOR[review.status] }}>
            {STATUS_LABEL[review.status]}
          </span>
        ) : null}
      </div>

      {review.title ? <p className="t-title mt-2.5">{review.title}</p> : null}

      <p
        className="t-body mt-2"
        style={
          clamp
            ? {
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        {review.body || "No written review — a rating only."}
      </p>

      {review.reply ? (
        <p
          className="t-secondary mt-3 pl-3"
          style={{ borderLeft: "1px solid var(--color-hairline)" }}
        >
          <span className="font-semibold" style={{ color: "var(--color-ink)" }}>
            Your reply
          </span>{" "}
          {review.reply}
        </p>
      ) : null}

      {review.incentiveCode ? (
        <p className="t-secondary mt-2">{review.incentiveDisclosure}</p>
      ) : null}

      <p className="t-secondary mt-3 flex items-center gap-2">
        <span>
          {review.authorName} &middot; {shortDate(review.publishedAt ?? review.createdAt)}
        </span>
        {media.length ? (
          <span
            className="ml-auto inline-flex items-center gap-1"
            style={{ color: "var(--color-text-3)" }}
            title={`${media.length} photo${media.length === 1 ? "" : "s"}`}
          >
            <IconCamera size={16} />
            <span className="t-data">{media.length}</span>
          </span>
        ) : null}
      </p>

      {review.productTitle ? (
        <p className="t-secondary mt-1" style={{ color: "var(--color-text-3)" }}>
          {review.productTitle}
        </p>
      ) : null}
    </article>
  );
}
