import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request timing collector used to emit a `Server-Timing` response header.
 *
 * Deliberately does not touch any service return type: handlers record into an
 * AsyncLocalStorage store, so `GatewayCheckResult` and every DTO stay unchanged.
 */
export type TimingStore = Map<string, number>;

const storage = new AsyncLocalStorage<TimingStore>();

export function runWithTiming<T>(fn: () => T): T {
  return storage.run(new Map<string, number>(), fn);
}

export function currentStore(): TimingStore | undefined {
  return storage.getStore();
}

export function record(label: string, durationMs: number): void {
  const store = storage.getStore();

  if (!store) {
    return;
  }

  store.set(label, (store.get(label) ?? 0) + durationMs);
}

/** Times an awaited call and records it under `label`. Rejections are still timed. */
export async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();

  try {
    return await fn();
  } finally {
    record(label, performance.now() - startedAt);
  }
}

export function formatServerTiming(store: TimingStore | undefined): string | null {
  if (!store || store.size === 0) {
    return null;
  }

  return Array.from(store.entries())
    .map(([label, durationMs]) => `${label};dur=${durationMs.toFixed(1)}`)
    .join(', ');
}
