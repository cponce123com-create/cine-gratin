/**
 * Small concurrency helpers.
 *
 * Import jobs talk to third-party APIs with hard rate limits, so every
 * provider-bound loop runs with a bounded number of in-flight requests
 * instead of an unbounded `Promise.all`.
 */

export interface MapOptions {
  /** Maximum number of tasks running at the same time. */
  concurrency?: number;
  /** Called after every settled task with the number of finished items. */
  onProgress?: (completed: number, total: number) => void | Promise<void>;
  /** Return false to stop processing further items. */
  shouldStop?: () => boolean;
}

/**
 * Maps over `items` with a bounded number of parallel workers.
 * The returned array preserves the input order. Rejected tasks are returned
 * as `{ status: "rejected" }` entries instead of failing the whole batch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: MapOptions = {},
): Promise<PromiseSettledResult<R>[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 16));
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  let completed = 0;
  let stopped = false;

  const runNext = async (): Promise<void> => {
    while (true) {
      if (stopped || options.shouldStop?.()) {
        stopped = true;
        return;
      }
      const index = nextIndex++;
      if (index >= items.length) return;

      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }

      completed += 1;
      if (options.onProgress) {
        await options.onProgress(completed, items.length);
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);

  // Items that never started (cancelled job) are reported as rejected.
  for (let i = 0; i < items.length; i++) {
    if (!results[i]) {
      results[i] = { status: "rejected", reason: new Error("cancelled") };
    }
  }

  return results;
}
