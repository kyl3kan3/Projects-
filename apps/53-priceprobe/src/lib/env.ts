/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every environment variable in .env.example.
 * Lazy getters (not module-scope reads) so `next build` succeeds without
 * secrets and the worker fails fast only when a variable is actually used.
 *
 * TODO:
 * - [ ] requireEnv(name): read process.env, throw a descriptive error
 *       naming the missing variable and the .env.example line to copy.
 * - [ ] optionalEnv(name, fallback?) for SENTRY_DSN, Shopify creds.
 * - [ ] Numeric coercion for SCRAPE_DEFAULT_MIN_INTERVAL_SECONDS;
 *       boolean coercion for DRY_RUN ("1" | "true").
 */

export const env = {
  get databaseUrl(): string {
    throw new Error("Not implemented");
  },
  get redisUrl(): string {
    throw new Error("Not implemented");
  },
  get appUrl(): string {
    throw new Error("Not implemented");
  },
  get authSecret(): string {
    throw new Error("Not implemented");
  },
  get stripeSecretKey(): string {
    throw new Error("Not implemented");
  },
  get stripeWebhookSecret(): string {
    throw new Error("Not implemented");
  },
  get stripePriceWatch(): string {
    throw new Error("Not implemented");
  },
  get stripePriceDesk(): string {
    throw new Error("Not implemented");
  },
  get stripePriceFloor(): string {
    throw new Error("Not implemented");
  },
  get resendApiKey(): string {
    throw new Error("Not implemented");
  },
  get emailFrom(): string {
    throw new Error("Not implemented");
  },
  get scrapeUserAgent(): string {
    throw new Error("Not implemented");
  },
  get scrapeDefaultMinIntervalSeconds(): number {
    throw new Error("Not implemented");
  },
  get shopifyApiKey(): string | undefined {
    throw new Error("Not implemented");
  },
  get shopifyApiSecret(): string | undefined {
    throw new Error("Not implemented");
  },
  get dryRun(): boolean {
    throw new Error("Not implemented");
  },
};
