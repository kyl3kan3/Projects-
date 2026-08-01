"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the crew screens open with no signal.
 *
 * Skipped in development: a stale cached shell during `next dev` is a
 * debugging tax with no upside.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
