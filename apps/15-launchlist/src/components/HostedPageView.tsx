import { SignupForm } from "@/components/SignupForm";
import { Wordmark } from "@/components/icons";
import { count } from "@/lib/format";
import { template } from "@/lib/templates";
import type { ListTheme, TemplateId } from "@/db/schema";

/**
 * The hosted launch page — the artifact. Also the builder's live preview, which
 * is why it is a pure presentational component taking plain values: what the
 * founder sees while editing is the page itself, not an approximation.
 *
 * The template chooses composition only. The button construction, the input, and
 * the type scale are identical on every theme, because DESIGN.md fixes them.
 */

export interface HostedPageContent {
  slug: string;
  name: string;
  headline: string;
  subhead: string;
  ctaLabel: string;
  proofLine: string;
  template: TemplateId;
  theme: ListTheme;
  badgeHidden: boolean;
}

export function HostedPageView({
  content,
  joinedCount,
  refCode,
  preview = false,
}: {
  content: HostedPageContent;
  /** People confirmed on the list. Shown honestly, including when it is zero. */
  joinedCount: number;
  refCode?: string | null;
  preview?: boolean;
}) {
  const def = template(content.template);
  const align = def.align;
  const headlineFont =
    content.theme.typePair === "mono" ? "var(--font-mono)" : "var(--font-display)";

  const proof =
    joinedCount === 0 ? (
      <>Be the first in line — the queue starts with you.</>
    ) : (
      <>
        {count(joinedCount)} {joinedCount === 1 ? "person is" : "people are"} already in line
      </>
    );

  const proofLine = (
    <p className="t-label" style={{ color: "var(--color-text-2)" }}>
      {proof}
    </p>
  );

  return (
    <main
      className="page-column"
      style={
        {
          "--page-ground": content.theme.ground,
          "--page-accent": content.theme.accent,
          background: content.theme.ground,
          minHeight: preview ? "100%" : "100dvh",
          display: "flex",
          flexDirection: "column",
          paddingTop: 40,
          paddingBottom: 40,
          textAlign: align,
          alignItems: align === "center" ? "center" : "stretch",
        } as React.CSSProperties
      }
    >
      <header style={{ marginBottom: 40 }}>
        <span
          className="t-label"
          style={{ color: "var(--page-accent)", letterSpacing: "0.08em" }}
        >
          {content.name}
        </span>
      </header>

      <h1
        className="t-display"
        style={{ fontFamily: headlineFont, maxWidth: "22ch", marginInline: align === "center" ? "auto" : undefined }}
      >
        {content.headline}
      </h1>

      {content.subhead ? (
        <p
          className="t-body"
          style={{
            marginTop: 16,
            color: "var(--color-text-2)",
            maxWidth: "40ch",
            marginInline: align === "center" ? "auto" : undefined,
          }}
        >
          {content.subhead}
        </p>
      ) : null}

      {def.proofPosition === "above" ? <div style={{ marginTop: 32 }}>{proofLine}</div> : null}

      <div style={{ marginTop: 32, width: "100%" }}>
        <SignupForm
          slug={content.slug}
          ctaLabel={content.ctaLabel}
          refCode={refCode}
          disabled={preview}
        />
      </div>

      {def.proofPosition === "below" ? <div style={{ marginTop: 20 }}>{proofLine}</div> : null}

      {content.proofLine ? (
        <p className="t-secondary" style={{ marginTop: 12 }}>
          {content.proofLine}
        </p>
      ) : null}

      {refCode ? (
        <p className="t-secondary" style={{ marginTop: 20, color: "var(--page-accent)" }}>
          You were invited — joining through this link moves your friend up the queue.
        </p>
      ) : null}

      <div style={{ flex: 1, minHeight: 40 }} />

      {content.badgeHidden ? null : (
        <footer className="hairline-t" style={{ paddingTop: 16, marginTop: 40, width: "100%" }}>
          <a
            className="t-label"
            href="https://launchlist.app"
            style={{ color: "var(--color-text-3)", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Powered by
            <Wordmark size={16} />
          </a>
        </footer>
      )}
    </main>
  );
}
