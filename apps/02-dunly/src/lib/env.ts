import { z } from "zod";

const envSchema = z.object({
  databaseUrl: z.string().optional(),
  redisUrl: z.string().optional(),
  appUrl: z.string().url().default("http://localhost:3000"),
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  stripeConnectClientId: z.string().optional(),
  stripePublishableKey: z.string().optional(),
  resendApiKey: z.string().optional(),
  emailFrom: z.string().default("Dunly <notifications@mail.dunly.com>"),
  resendWebhookSecret: z.string().optional(),
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioFromNumber: z.string().optional(),
  authSecret: z.string().default("dev-auth-secret-change-me"),
  authGoogleId: z.string().optional(),
  authGoogleSecret: z.string().optional(),
  cardUpdateTokenSecret: z.string().default("dev-card-update-token-secret-change-me"),
  dryRun: z.boolean().default(true),
});

export const serverEnv = envSchema.parse({
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripeConnectClientId: process.env.STRIPE_CONNECT_CLIENT_ID,
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
  authSecret: process.env.AUTH_SECRET,
  authGoogleId: process.env.AUTH_GOOGLE_ID,
  authGoogleSecret: process.env.AUTH_GOOGLE_SECRET,
  cardUpdateTokenSecret: process.env.CARD_UPDATE_TOKEN_SECRET,
  dryRun: process.env.DRY_RUN !== "0",
});

export function requireEnv(name: keyof typeof serverEnv): string {
  const value = serverEnv[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
