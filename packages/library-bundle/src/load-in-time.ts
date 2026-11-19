import { setTimeout as delay } from "node:timers/promises";

/**
 * `load()`, rejecting with "<what> load timed out after <timeoutMs> ms" once
 * it has taken `timeoutMs`, so a slow Blob never holds a request.
 */
export const loadInTime = async <Value>(
  load: () => Promise<Value>,
  { timeoutMs, what }: { timeoutMs: number; what: string }
): Promise<Value> => {
  const controller = new AbortController();

  const timeout = delay(timeoutMs, undefined, {
    signal: controller.signal,
  }).then(() => {
    throw new Error(`${what} load timed out after ${timeoutMs} ms`);
  });

  // Aborted once the load wins: nothing waits on it then.
  timeout.catch(() => undefined);

  try {
    return await Promise.race([load(), timeout]);
  } finally {
    controller.abort();
  }
};
