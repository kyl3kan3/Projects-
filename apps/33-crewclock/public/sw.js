/*
 * CrewClock service worker.
 *
 * Deliberately small. It does exactly one job: make sure the crew clock screen
 * opens when there is no signal, because a punch that cannot be recorded is the
 * failure this product cannot have.
 *
 * What it does NOT do, on purpose:
 *   - It does not queue punches. The outbox is IndexedDB, owned by the page
 *     (src/lib/outbox.ts), flushed when the app is open and the signal returns.
 *     Browsers do not give a web app reliable background location or reliable
 *     background sync, and the architecture never depends on a capability
 *     browsers do not grant (README Key Risk 3).
 *   - It does not cache API responses. Stale hours are worse than no hours.
 */

const SHELL = "crewclock-shell-v1";
/* Navigations we want to survive a dead cell: the crew's three screens. */
const SHELL_ROUTES = ["/clock", "/hours", "/profile"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Best effort: a route that fails to prefetch is simply not cached yet.
      await Promise.allSettled(SHELL_ROUTES.map((route) => cache.add(new Request(route))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== SHELL).map((n) => caches.delete(n)));
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

  /* Immutable build assets: cache first, they never change under a hash. */
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  /* Navigations: network first, fall back to the cached shell when offline. */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          const hit = await cache.match(request, { ignoreSearch: true });
          if (hit) return hit;
          const clock = await cache.match("/clock");
          if (clock) return clock;
          throw new Error("offline and nothing cached");
        }
      })(),
    );
  }
});
