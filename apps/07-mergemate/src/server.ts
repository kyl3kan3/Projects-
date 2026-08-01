/**
 * The webhook + dashboard process: `npm run dev` / `npm start`.
 *
 * Probot's own CLI (`probot run`) cannot load TypeScript, so the server is
 * constructed here instead: a Probot class with this app's credentials baked in,
 * wrapped in Probot's express-backed Server, with the application function from
 * src/index.ts loaded onto it.
 *
 * In development WEBHOOK_PROXY_URL (a smee.io channel) makes GitHub's deliveries
 * reach localhost. In production GitHub posts straight to the public URL.
 */

import "./lib/load-env";
import { Probot, Server } from "probot";
import app from "./index";
import { env } from "./lib/env";
import { closeDb } from "./db";
import { closeQueue, queueEnabled } from "./review/queue";
import { log } from "./lib/logger";

async function main() {
  const port = env.port;

  const server = new Server({
    port,
    host: process.env.HOST,
    webhookPath: process.env.WEBHOOK_PATH ?? "/api/github/webhooks",
    webhookProxy: process.env.WEBHOOK_PROXY_URL,
    Probot: Probot.defaults({
      appId: process.env.APP_ID,
      privateKey: process.env.PRIVATE_KEY,
      secret: process.env.WEBHOOK_SECRET,
      logLevel: env.logLevel as never,
    }),
  });

  await server.load(app);
  await server.start();

  log.info(
    {
      port,
      queue: queueEnabled() ? "redis" : "inline",
      dashboard: env.dashboardUrl,
      model: process.env.ANTHROPIC_API_KEY ? process.env.REVIEW_MODEL ?? "claude-sonnet-5" : "fake-deterministic",
    },
    "mergemate listening",
  );

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    await server.stop().catch(() => undefined);
    if (queueEnabled()) await closeQueue().catch(() => undefined);
    await closeDb().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, "server failed to start");
  process.exit(1);
});
