/**
 * A live widget instance, rendered server-side from the same functions the embed
 * uses on a storefront.
 *
 * This is the widget studio's whole argument: the merchant is not looking at a
 * mockup of the wall, they are looking at the wall, produced by
 * `renderWidget()` from their real reviews with their real theme tokens. The only
 * difference from a storefront is that this markup arrives in the page instead of
 * a shadow root, so the styles are scoped to a wrapper class instead of `:host`.
 *
 * `dangerouslySetInnerHTML` is safe here for exactly one reason: every untrusted
 * field went through the escaping in src/widget/escape.ts, which has its own test
 * file. If that ever stops being true, this is where it shows up first.
 */

import { renderWidget, widgetStyles } from "@/widget/render";
import type { WidgetPayload } from "@/widget/types";

export function WidgetPreview({ payload, id }: { payload: WidgetPayload; id: string }) {
  const scope = `tb-preview-${id}`;
  // Re-scope the shadow-root stylesheet to this wrapper. `:host` has no meaning
  // outside a shadow tree, and the container query needs a named container.
  const css = widgetStyles(payload.widget)
    .replace(/:host\{/g, `.${scope}{`)
    .replace(/\.tb-/g, `.${scope} .tb-`);

  return (
    <div>
      <style>{css}</style>
      <div className={scope} dangerouslySetInnerHTML={{ __html: renderWidget(payload) }} />
    </div>
  );
}
