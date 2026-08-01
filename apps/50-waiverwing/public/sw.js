/**
 * The kiosk service worker.
 *
 * Its only job is to keep a counter tablet usable across a connectivity drop.
 * The IndexedDB outbox (src/lib/outbox.ts) already survives a drop *during* a
 * session; this survives a reload during one, which is the other half — a tablet
 * that a member of staff refreshes at the wrong moment must not become a blank
 * page with a dinosaur on it.
 *
 * Two deliberate rules:
 *
 *  1. **Never cache /api/.** A signature must reach the server or land in the
 *     outbox; a cached POST response would be a lie about a legal record.
 *  2. **Network first for the kiosk document.** The cached copy is a fallback,
 *     not the default, so a published waiver version reaches the counter as soon
 *     as the tablet can see the network. When the fallback *is* used, the cached
 *     page carries the version id it was rendered with, and the signature pins
 *     that version — the signer is bound to the text they actually read, which
 *     is the whole point.
 */

const SHELL = "waiverwing-shell-v1";
const ASSETS = "waiverwing-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Build output is immutable and content-hashed: cache first, forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  // The kiosk document: network first, cached copy as the fallback.
  if (request.mode === "navigate" && url.pathname.startsWith("/kiosk/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (err) {
          const hit = await cache.match(request);
          if (hit) return hit;
          throw err;
        }
      })(),
    );
  }
});
