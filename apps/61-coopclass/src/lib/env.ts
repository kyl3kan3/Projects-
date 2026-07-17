/**
 * src/lib/env.ts — typed, lazy access to every variable in
 * .env.example. Lazy getters so `next build` succeeds without secrets.
 *
 * TODO: requireEnv/optionalEnv helpers; DRY_RUN boolean coercion.
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
  get linkTokenSecret(): string {
    throw new Error("Not implemented");
  },
  get stripeSecretKey(): string {
    throw new Error("Not implemented");
  },
  get stripeWebhookSecret(): string {
    throw new Error("Not implemented");
  },
  get stripeConnectWebhookSecret(): string {
    throw new Error("Not implemented");
  },
  get stripePriceGathering(): string {
    throw new Error("Not implemented");
  },
  get stripePriceCommunity(): string {
    throw new Error("Not implemented");
  },
  get stripePriceAcademy(): string {
    throw new Error("Not implemented");
  },
  get stripePriceSummerPause(): string {
    throw new Error("Not implemented");
  },
  get resendApiKey(): string {
    throw new Error("Not implemented");
  },
  get emailFrom(): string {
    throw new Error("Not implemented");
  },
  get dryRun(): boolean {
    throw new Error("Not implemented");
  },
};
