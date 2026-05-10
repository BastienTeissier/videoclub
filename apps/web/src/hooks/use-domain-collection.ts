"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DomainCollectionConfig<T, S> {
  fetch: () => Promise<T[]>;
  toState: (items: T[]) => S;
  initialState: S;
}

export interface MutationPlan<S, R> {
  optimistic: (state: S) => S;
  rollback: (state: S) => S;
  perform: () => Promise<R>;
}

export interface DomainCollectionApi<S, K, R = unknown> {
  state: S;
  refetch: () => Promise<void>;
  mutate: <Result>(key: K, plan: MutationPlan<S, Result>) => Promise<Result>;
  // Discriminator marker so the generic `R` parameter is preserved in the surface.
  // (Otherwise TypeScript drops it and tooling can't infer it.)
  __r?: R;
}

/**
 * Generic primitive for a client-side domain collection.
 *
 * Owns: initial fetch, refetch, optimistic mutate-with-rollback, per-item
 * request counter that prevents stale rollbacks ("only roll back if your
 * counter is still the latest").
 *
 * Domain-specific contexts (watchlist, reviews) wrap this with their own
 * state shape (`Set<id>`, `Map<id, rating>`) and method names.
 *
 * Optimistic updates fire on direct UI actions only. Agent-driven mutations
 * refetch via the DomainKey registry — they're already settled server-side
 * by the time the frontend learns.
 */
export function useDomainCollection<T, K, S>(
  config: DomainCollectionConfig<T, S>,
): DomainCollectionApi<S, K> {
  const [state, setState] = useState<S>(config.initialState);
  const counters = useRef(new Map<K, number>());
  const fetchFn = config.fetch;
  const toState = config.toState;

  useEffect(() => {
    let cancelled = false;
    fetchFn()
      .then((items) => {
        if (!cancelled) setState(toState(items));
      })
      .catch(() => {
        // silent: initial fetch failure leaves initialState
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refetch = useCallback(async () => {
    try {
      const items = await fetchFn();
      setState(toState(items));
    } catch {
      // silent
    }
  }, [fetchFn, toState]);

  const mutate = useCallback(
    async function mutateImpl<Result>(
      key: K,
      plan: MutationPlan<S, Result>,
    ): Promise<Result> {
      const counter = (counters.current.get(key) ?? 0) + 1;
      counters.current.set(key, counter);

      setState(plan.optimistic);

      try {
        return await plan.perform();
      } catch (err) {
        if (counters.current.get(key) === counter) {
          setState(plan.rollback);
        }
        throw err;
      }
    },
    [],
  );

  return { state, refetch, mutate };
}
