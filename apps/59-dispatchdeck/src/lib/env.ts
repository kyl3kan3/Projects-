/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every environment variable in .env.example.
 * Lazy getters so `next build` succeeds without secrets and the worker
 * fails fast only when a variable is actually used.
 *
 * TODO:
 * - [ ] requireEnv(name) with descriptive missing-variable errors.
 * - [ ] optionalEnv for SENTRY_DSN.
 * - [ ] Boolean coercion for DRY_RUN.
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
  get sessionSecret(): string {
    throw new Error("Not implemented");
  },
  get anthropicApiKey(): string {
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
  get stripeSecretKey(): string {
    throw new Error("Not implemented");
  },
  get stripeWebhookSecret(): string {
    throw new Error("Not implemented");
  },
  get stripePriceSolo(): string {
    throw new Error("Not implemented");
  },
  get stripePriceTeam(): string {
    throw new Error("Not implemented");
  },
  get stripePriceFleet(): string {
    throw new Error("Not implemented");
  },
  get resendApiKey(): string {
    throw new Error("Not implemented");
  },
  get emailFrom(): string {
    throw new Error("Not implemented");
  },
  get inboundParseSecret(): string {
    throw new Error("Not implemented");
  },
  get dryRun(): boolean {
    throw new Error("Not implemented");
  },
};
