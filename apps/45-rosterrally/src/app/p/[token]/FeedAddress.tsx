"use client";

/**
 * The calendar address as one selectable line. Some calendar apps want the URL
 * pasted rather than followed, and a parent should not have to fight a 300-
 * character token to get it — tapping selects the whole thing.
 */
export function FeedAddress({ url, label }: { url: string; label: string }) {
  return (
    <input
      className="input input-mono mt-2"
      style={{ height: 40, fontSize: 13 }}
      readOnly
      value={url}
      aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.currentTarget.select()}
    />
  );
}
