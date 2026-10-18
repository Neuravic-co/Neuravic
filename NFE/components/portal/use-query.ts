"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type Page } from "@/lib/api";
import { useSession } from "./session";

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError(0, "error", "Something went wrong");

interface QueryResult<T> {
  /** Identifies the request this result belongs to (inputs without the reload counter). */
  base: string;
  /** Identifies the exact load (inputs plus the reload counter). */
  key: string;
  data?: T;
  error?: ApiError;
}

/**
 * Loads data when `deps` change. While reloading the same inputs the previous
 * data stays visible. A 401 means the session ended, so the portal returns to
 * the sign-in screen instead of showing an error.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[]) {
  const { expire } = useSession();
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<QueryResult<T> | null>(null);
  const base = JSON.stringify(deps);
  const key = `${base}#${tick}`;

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => {
        if (!cancelled) setResult({ base, key, data });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const error = toApiError(caught);
        if (error.status === 401) expire();
        setResult({ base, key, error });
      });
    return () => {
      cancelled = true;
    };
    // `fetcher` is intentionally excluded: callers pass a new closure every render
    // and describe what it depends on through `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, expire]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  const current = result?.key === key ? result : undefined;
  return {
    data: result?.base === base ? result.data : undefined,
    error: current?.error,
    loading: current === undefined,
    reload,
  };
}

interface PagedResult<T> {
  key: string;
  items: T[];
  nextCursor: string | null;
  error?: ApiError;
}

/** Cursor-paginated list: loads the first page, then appends more on request. */
export function usePaged<T>(path: string | null, query: Record<string, string | number | undefined>, limit = 25) {
  const { expire } = useSession();
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<PagedResult<T> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const queryKey = JSON.stringify(query);
  const key = `${path}|${queryKey}|${limit}#${tick}`;

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    api<Page<T>>(path, { query: { ...JSON.parse(queryKey), limit } })
      .then((page) => {
        if (!cancelled) setResult({ key, items: page.items, nextCursor: page.nextCursor });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const error = toApiError(caught);
        if (error.status === 401) expire();
        setResult({ key, items: [], nextCursor: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [path, queryKey, limit, key, expire]);

  const current = result?.key === key ? result : undefined;
  const nextCursor = current?.nextCursor ?? null;

  const loadMore = useCallback(async () => {
    if (path === null || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<Page<T>>(path, { query: { ...JSON.parse(queryKey), limit, cursor: nextCursor } });
      setResult((latest) =>
        latest && latest.key === key ? { ...latest, items: [...latest.items, ...page.items], nextCursor: page.nextCursor } : latest,
      );
    } catch (caught) {
      if (toApiError(caught).status === 401) expire();
    } finally {
      setLoadingMore(false);
    }
  }, [path, queryKey, limit, key, nextCursor, loadingMore, expire]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return {
    items: current?.items ?? [],
    error: current?.error,
    loading: path !== null && current === undefined,
    loadingMore,
    hasMore: nextCursor !== null,
    loadMore,
    reload,
  };
}

/** Human-readable message for a failed action. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const field = error.fieldErrors[0];
    if (field) return `${field.path ? `${field.path}: ` : ""}${field.message}`;
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/** Tracks a user-triggered action: busy flag and error message. Returns true when it succeeds. */
export function useAction() {
  const { expire } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      setError(undefined);
      try {
        await action();
        return true;
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) expire();
        setError(describeError(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [expire],
  );

  return { busy, error, run };
}
