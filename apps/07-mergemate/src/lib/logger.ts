/**
 * Structured logging.
 *
 * Probot already bundles pino and hands each webhook handler a child logger, so
 * this module exists only for the processes that run outside Probot (worker,
 * sweep, eval). Same JSON shape, so one log pipeline reads both.
 */

type Level = "trace" | "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (configured === "silent") return Number.MAX_SAFE_INTEGER;
  return ORDER[configured as Level] ?? ORDER.info;
}

export interface Logger {
  trace(fields: Record<string, unknown>, msg?: string): void;
  debug(fields: Record<string, unknown>, msg?: string): void;
  info(fields: Record<string, unknown>, msg?: string): void;
  warn(fields: Record<string, unknown>, msg?: string): void;
  error(fields: Record<string, unknown>, msg?: string): void;
  child(fields: Record<string, unknown>): Logger;
}

function emit(level: Level, base: Record<string, unknown>, fields: Record<string, unknown>, msg?: string) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...base, ...fields, msg });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  return {
    trace: (f, m) => emit("trace", base, f, m),
    debug: (f, m) => emit("debug", base, f, m),
    info: (f, m) => emit("info", base, f, m),
    warn: (f, m) => emit("warn", base, f, m),
    error: (f, m) => emit("error", base, f, m),
    child: (f) => createLogger({ ...base, ...f }),
  };
}

export const log = createLogger({ app: "mergemate" });
