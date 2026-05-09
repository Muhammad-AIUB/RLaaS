'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  setData: (next: T | null) => void;
  setError: (message: string) => void;
}

/**
 * Generic data-loading hook for client pages.
 *
 * Features:
 *  - Tracks `loading`, `error`, and `data` in one place
 *  - Re-runs the loader when any value in `deps` changes
 *  - Returns a stable `reload()` function for mutations
 *  - Ignores stale responses if the component unmounts mid-flight
 *  - Captures the error message in the same shape every page expects
 *
 * Pages keep their own `pending`/form state — this only owns the
 * "fetch + display" lifecycle.
 */
export function useAsyncResource<T>(
  loader: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loaderRef.current();
      if (!mountedRef.current) return;
      setData(result);
      setError('');
    } catch (caughtError) {
      if (!mountedRef.current) return;
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load data',
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData, setError };
}
