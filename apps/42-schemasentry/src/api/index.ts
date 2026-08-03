/**
 * src/api/index.ts — the self-hostable Fastify server.
 *
 * ARCHITECTURE.md puts the `/v1` surface on Fastify: the API is consumed by the
 * CLI and CI far more than by browsers, and a plain Node process is what an
 * enterprise self-host ask actually needs. The portfolio's default target is
 * Vercel, where the same handlers are mounted as Next route handlers, so this
 * file is deliberately thin — every endpoint is one line of adapter over
 * `src/lib/service.ts`. Both hosts run identical logic; only the transport
 * differs.
 *
 *   npm run api          # listens on API_PORT (default 8787)
 *
 * The drain loop is what replaces the BullMQ worker `src/api/worker.ts` used to
 * be: when this process is running there is somewhere for retries to happen, so
 * it polls the delivery table. On Vercel the cron route does the same work.
 */

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { closeDb } from "@/db";
import { drainDeliveries } from "@/lib/notify";
import { handleCheck, handleListApis, handlePush, type ServiceRequest } from "@/lib/service";

const PORT = Number(process.env.API_PORT ?? 8787);
const DRAIN_INTERVAL_MS = 15_000;

export function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 8 * 1024 * 1024,
  });

  app.register(cors, {
    origin: process.env.APP_URL ?? true,
    methods: ["GET", "POST"],
    allowedHeaders: ["authorization", "content-type"],
  });

  const request = (headers: Record<string, unknown>, body: unknown): ServiceRequest => ({
    authorization: typeof headers.authorization === "string" ? headers.authorization : null,
    body,
  });

  app.get("/health", async () => ({ ok: true, service: "schemasentry-api" }));

  app.post("/v1/specs", async (req, reply) => {
    const result = await handlePush(request(req.headers as Record<string, unknown>, req.body));
    return reply.status(result.status).send(result.body);
  });

  app.post("/v1/check", async (req, reply) => {
    const result = await handleCheck(request(req.headers as Record<string, unknown>, req.body));
    return reply.status(result.status).send(result.body);
  });

  app.get("/v1/apis", async (req, reply) => {
    const result = await handleListApis(request(req.headers as Record<string, unknown>, null));
    return reply.status(result.status).send(result.body);
  });

  return app;
}

async function main() {
  const app = buildServer();

  const timer = setInterval(() => {
    drainDeliveries(25, 10_000).catch((err) => app.log.error({ err }, "delivery drain failed"));
  }, DRAIN_INTERVAL_MS);
  timer.unref();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    clearInterval(timer);
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

// Only boot when run directly, so tests can import `buildServer` without
// binding a port.
if (process.argv[1] && /src[/\\]api[/\\]index\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
