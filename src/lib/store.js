import { useCallback, useRef, useSyncExternalStore } from "react";

const identity = (state) => state;

const isMergeable = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  const getState = () => state;

  const setState = (partial) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    if (Object.is(next, state)) return;

    let merged = next;
    if (isMergeable(state) && isMergeable(next)) {
      merged = { ...state, ...next };
      const changed = Object.keys(merged).some(
        (key) => !Object.is(merged[key], state[key]),
      );
      if (!changed) return;
    }

    if (Object.is(merged, state)) return;
    state = merged;
    for (const listener of [...listeners]) listener();
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, setState, subscribe };
}

export function useStore(store, selector = identity) {
  const cache = useRef(null);

  const getSnapshot = useCallback(() => {
    const current = store.getState();
    const hit = cache.current;
    if (hit && hit.state === current && hit.selector === selector) {
      return hit.result;
    }
    const result = selector(current);
    cache.current = { state: current, selector, result };
    return result;
  }, [store, selector]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
