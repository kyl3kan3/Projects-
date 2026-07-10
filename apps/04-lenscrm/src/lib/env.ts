/** Typed environment access; server-only values throw lazily at read time. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
export const env = {
  get databaseUrl() { return req("DATABASE_URL"); },
  get redisUrl() { return req("REDIS_URL"); },
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
  get authSecret() { return req("AUTH_SECRET"); },

  get stripeSecretKey() { return req("STRIPE_SECRET_KEY"); },
  get stripeWebhookSecret() { return req("STRIPE_WEBHOOK_SECRET"); },

  get r2AccountId() { return req("R2_ACCOUNT_ID"); },
  get r2AccessKeyId() { return req("R2_ACCESS_KEY_ID"); },
  get r2SecretAccessKey() { return req("R2_SECRET_ACCESS_KEY"); },
  get r2Bucket() { return process.env.R2_BUCKET ?? "lenscrm-galleries"; },
  get r2PublicBase() { return process.env.R2_PUBLIC_BASE ?? ""; },

  get resendApiKey() { return req("RESEND_API_KEY"); },
  get emailFrom() { return process.env.EMAIL_FROM ?? "LensCRM <hello@lenscrm.app>"; },

  get dryRun() { return process.env.DRY_RUN === "1"; },
};
