/**
 * src/lib/env.ts — typed, lazy access to every variable in
 * .env.example. Lazy getters so `next build` succeeds without secrets.
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
  get stripePriceHouse(): string {
    throw new Error("Not implemented");
  },
  get stripePriceGroup(): string {
    throw new Error("Not implemented");
  },
  get stripePriceHospitality(): string {
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
