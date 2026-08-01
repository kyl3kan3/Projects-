/**
 * The photo thread: hairline-divided rows, author label, body, and a grid of 96px
 * tiles. Used by both sides — the landlord's request screen and the tenant's page —
 * so the conversation looks the same to both people in it.
 *
 * Photos render through the storage adapter's URL, which is an authorised route,
 * never a public bucket path.
 */

import type { RequestMessage } from "@/db/schema";
import { urlForKey } from "@/lib/storage";

export function PhotoThread({
  messages,
  landlordName,
  tenantName,
}: {
  messages: RequestMessage[];
  landlordName: string;
  tenantName: string;
}) {
  return (
    <div className="card p-4">
      {messages.map((message, i) => (
        <div key={message.id} className={i > 0 ? "hairline-t mt-4 pt-4" : ""}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-label" style={{ color: "var(--color-ink)" }}>
              {message.author === "tenant" ? tenantName : landlordName}
            </p>
            <p className="t-data" style={{ color: "var(--color-text-3)" }}>
              {message.sentAt.toISOString().slice(0, 16).replace("T", " ")}
            </p>
          </div>
          {message.body ? <p className="t-body mt-2 whitespace-pre-wrap">{message.body}</p> : null}
          {message.photoKeys.length > 0 ? (
            <div className="photo-grid mt-3">
              {message.photoKeys.map((key) => (
                <a key={key} href={urlForKey(key)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="photo-tile" src={urlForKey(key)} alt="Photo attached to this repair request" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
