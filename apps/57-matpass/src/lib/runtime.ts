/**
 * Where is this code running?
 *
 * The database pool is sized very differently in a serverless function (one
 * connection per warm instance, short idle timeout) and in a long-lived process
 * like the worker or a test run.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
