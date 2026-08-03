/**
 * Error surfacing for server actions.
 *
 * Domain rules throw `AppError` with a message written for a contractor, and
 * those are safe to show. Anything else (a driver error, a null deref) is
 * replaced with a generic line so a stack trace or a connection string never
 * reaches a form.
 */

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function appError(message: string): AppError {
  return new AppError(message);
}

export function safeMessage(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.message;
  console.error("[permitpath] unexpected error", err);
  return fallback;
}
