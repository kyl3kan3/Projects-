import Link from "next/link";
import { IconChevronLeft, IconGlobe } from "@/components/icons";
import type { List } from "@/db/schema";
import { pageUrl } from "@/lib/lists";

/**
 * The header every list screen shares: a way back to the list picker, the
 * product name, and the live page address — which is the thing a founder wants
 * to grab and paste more than anything else on the screen.
 */
export function ListHeader({
  list,
  section,
  detail,
}: {
  list: List;
  section: string;
  detail?: React.ReactNode;
}) {
  const url = pageUrl(list);
  return (
    <header style={{ paddingTop: 32, paddingBottom: 24 }}>
      <Link href="/lists" className="btn-quiet" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <IconChevronLeft size={18} />
        Lists
      </Link>
      <p className="t-label" style={{ marginTop: 16 }}>
        {list.name} · {section}
      </p>
      {detail ? <div style={{ marginTop: 8 }}>{detail}</div> : null}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="t-data"
        style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <IconGlobe size={16} />
        {url.replace(/^https?:\/\//, "")}
      </a>
    </header>
  );
}
