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
 * - [ ] optionalEnv(name, fallback?) for SENTRY_DSN and friends.
 * - [ ] Boolean coercion for DRY_RUN ("1" | "true").
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
  get jobTokenSecret(): string {
    throw new Error("Not implemented");
  },
  get stripeSecretKey(): string {
    throw new Error("Not implemented");
  },
  get stripeWebhookSecret(): string {
    throw new Error("Not implemented");
  },
  get stripePriceSolo(): string {
    throw new Error("Not implemented");
  },
  get stripePriceHost(): string {
    throw new Error("Not implemented");
  },
  get stripePriceOperator(): string {
    throw new Error("Not implemented");
  },
  get resendApiKey(): string {
    throw new Error("Not implemented");
  },
  get emailFrom(): string {
    throw new Error("Not implemented");
  },
  get twilioAccountSid(): string {
    throw new Error("Not implemented");
  },
  get twilioAuthToken(): string {
    throw new Error("Not implemented");
  },
  get twilioFromNumber(): string {
    throw new Error("Not implemented");
  },
  get r2AccountId(): string {
    throw new Error("Not implemented");
  },
  get r2AccessKeyId(): string {
    throw new Error("Not implemented");
  },
  get r2SecretAccessKey(): string {
    throw new Error("Not implemented");
  },
  get r2Bucket(): string {
    throw new Error("Not implemented");
  },
  get dryRun(): boolean {
    throw new Error("Not implemented");
  },
};
