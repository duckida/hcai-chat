import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, useStore } from "@/lib/store";

const setup = () => createStore({ count: 0, label: "idle" });

describe("createStore", () => {
  it("returns the initial state", () => {
    const store = setup();
    expect(store.getState()).toEqual({ count: 0, label: "idle" });
  });

  it("merges partial updates", () => {
    const store = setup();
    store.setState({ label: "busy" });
    expect(store.getState()).toEqual({ count: 0, label: "busy" });
  });

  it("accepts an updater function", () => {
    const store = setup();
    store.setState((state) => ({ count: state.count + 1 }));
    expect(store.getState().count).toBe(1);
  });

  it("replaces non-object state wholesale", () => {
    const store = createStore("a");
    store.setState("b");
    expect(store.getState()).toBe("b");
  });

  it("notifies subscribers on change", () => {
    const store = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState({ count: 1 });
    unsubscribe();
    store.setState({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the same reference when nothing actually changed", () => {
    const store = setup();
    const before = store.getState();
    store.setState({ count: 0 });
    expect(store.getState()).toBe(before);
    store.setState((state) => state);
    expect(store.getState()).toBe(before);
  });

  it("notifies a listener that unsubscribes mid-notification", () => {
    const store = setup();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
    store.subscribe(second);
    store.setState({ count: 1 });
    expect(second).toHaveBeenCalledTimes(1);
    store.setState({ count: 2 });
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("supports removing keys by writing undefined", () => {
    const store = createStore({ a: 1, b: 2 });
    store.setState({ b: undefined });
    expect(store.getState()).toEqual({ a: 1, b: undefined });
    store.setState({ c: 3 });
    expect(store.getState()).toEqual({ a: 1, b: undefined, c: 3 });
  });
});

describe("useStore", () => {
  it("reads the selected slice", () => {
    const store = setup();
    const { result } = renderHook(() => useStore(store, (s) => s.count));
    expect(result.current).toBe(0);
  });

  it("re-renders when the selected slice changes", () => {
    const store = setup();
    const { result } = renderHook(() => useStore(store, (s) => s.count));
    act(() => store.setState({ count: 5 }));
    expect(result.current).toBe(5);
  });

  it("does not re-render when an unrelated slice changes", () => {
    const store = setup();
    const render = vi.fn();
    renderHook(() => {
      render();
      return useStore(store, (s) => s.count);
    });
    act(() => store.setState({ label: "busy" }));
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("returns a stable snapshot for inline selectors without looping", () => {
    const store = setup();
    const renders = vi.fn();
    const { result } = renderHook(() => {
      renders();
      return useStore(store, (s) => ({ count: s.count }));
    });
    expect(result.current).toEqual({ count: 0 });
    expect(renders.mock.calls.length).toBeLessThan(5);

    act(() => store.setState({ label: "busy" }));
    expect(result.current).toEqual({ count: 0 });
    expect(renders.mock.calls.length).toBeLessThan(6);

    act(() => store.setState({ count: 2 }));
    expect(result.current).toEqual({ count: 2 });
    expect(renders.mock.calls.length).toBeLessThan(8);
  });

  it("reads whole state when no selector is given", () => {
    const store = setup();
    const { result } = renderHook(() => useStore(store));
    expect(result.current).toEqual({ count: 0, label: "idle" });
    act(() => store.setState({ count: 3 }));
    expect(result.current).toEqual({ count: 3, label: "idle" });
  });

  it("unsubscribes on unmount", () => {
    const store = setup();
    let active = 0;
    const subscribe = store.subscribe;
    store.subscribe = (listener) => {
      active += 1;
      const unsubscribe = subscribe(listener);
      return () => {
        active -= 1;
        unsubscribe();
      };
    };
    const { unmount } = renderHook(() => useStore(store, (s) => s.count));
    expect(active).toBe(1);
    unmount();
    expect(active).toBe(0);
  });
});
