/**
 * src/lib/reset-key.ts
 *
 * A remount key for `<select>` elements inside a server-action form.
 *
 * React 19 resets an uncontrolled form once a server action returns. Text inputs
 * survive that, because the reset restores their `defaultValue` — which is why
 * every rejectable form in this app echoes what was submitted back through
 * `defaultValue`.
 *
 * A `<select>` does not survive it, and neither obvious fix works on its own:
 *
 *  - `defaultValue` is applied at mount, so the reset restores whichever option
 *    was selected when the component *first* mounted — the first one.
 *  - Making it controlled does not help either: the reset changes the DOM value
 *    while React's `value` prop is unchanged, so React sees no difference and
 *    never writes it back.
 *
 * On the quote builder that would silently un-pick the item a rejected line was
 * for, and the next submit would add a quantity of the wrong thing while
 * reporting success.
 *
 * So: bump a key whenever the action returns, and give the `<select>` that key
 * with a `defaultValue`. A changed key remounts it, and a fresh mount applies the
 * echoed value.
 */

import { useEffect, useState } from "react";

export function useResetKey(state: unknown): number {
  const [key, setKey] = useState(0);
  useEffect(() => {
    setKey((k) => k + 1);
  }, [state]);
  return key;
}
