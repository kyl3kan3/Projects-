/**
 * The service worker. Precaches the app shell so a crew link opens in airplane
 * mode at the bottom of a lift shaft — the whole reason this product works on a
 * jobsite.
 *
 * The signature outbox is *not* here: it lives in IndexedDB (`lib/offline.ts`)
 * and is drained by the page, because a background-sync event that fires while
 * the phone is locked cannot show the foreman that his signatures went through.
 * The worker's job is narrower and more important — make sure the page loads at
 * all when there is no signal.
 */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
