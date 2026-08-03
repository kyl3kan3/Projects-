"use client";

import { useEffect } from "react";

/**
 * Registers the Serwist-built service worker.
 *
 * @serwist/next compiles `src/sw.ts` into `public/sw.js` at build time but does
 * not register it — that is the app's job, and doing it here rather than in the
 * crew page means the dashboard is also usable on a bad connection.
 *
 * Deliberately production-only: `next dev` has no built worker to register, and a
 * worker caching a dev bundle serves yesterday's JavaScript.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        // A jobsite phone with storage disabled still has to run the huddle; the
        // outbox is IndexedDB and independent of this.
        console.warn("[sw] registration failed", err);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
