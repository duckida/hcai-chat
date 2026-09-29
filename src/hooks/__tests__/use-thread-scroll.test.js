import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useThreadScroll } from "@/hooks/use-thread-scroll";

/**
 * jsdom has no layout, so every scrollable element reports zero. These stand
 * in for it with real numbers: 1000px of content in a 500px window leaves the
 * bottom reachable at scrollTop 500.
 */
function makeScrollable({ scrollHeight = 1000, clientHeight = 500 } = {}) {
  return { scrollHeight, clientHeight, scrollTop: 0 };
}

function setup({ isStreaming = false, element = makeScrollable() } = {}) {
  const view = renderHook(
    (props) => useThreadScroll(props),
    { initialProps: { isStreaming } },
  );
  act(() => {
    view.result.current.scrollRef.current = element;
  });
  // renderHook's rerender() forwards its argument to the callback, so a bare
  // call would hand the hook `undefined` rather than the current props.
  return {
    ...view,
    element,
    rerenderView: () => view.rerender({ isStreaming }),
  };
}

describe("useThreadScroll", () => {
  it("pins the view to the bottom", () => {
    const { element, rerenderView } = setup();

    rerenderView();

    expect(element.scrollTop).toBe(1000);
  });

  it("stops following once the user scrolls away from the bottom", () => {
    const { element, rerenderView, result } = setup();

    element.scrollTop = 0;
    act(() => result.current.handleScroll());
    expect(result.current.userScrolledAway).toBe(true);

    rerenderView();
    expect(element.scrollTop).toBe(0);
  });

  it("keeps following for a movement that stays within the threshold", () => {
    const { element, rerenderView, result } = setup();

    // 1000 - 400 - 500 = exactly 100px from the bottom.
    element.scrollTop = 400;
    act(() => result.current.handleScroll());
    expect(result.current.userScrolledAway).toBe(false);

    rerenderView();
    expect(element.scrollTop).toBe(1000);
  });

  it("scrollToBottom returns to the bottom and resumes following", () => {
    const { element, result } = setup();

    element.scrollTop = 0;
    act(() => result.current.handleScroll());
    expect(result.current.userScrolledAway).toBe(true);

    act(() => result.current.scrollToBottom());

    expect(element.scrollTop).toBe(1000);
    expect(result.current.userScrolledAway).toBe(false);
  });

  it("hands scrolling back when a turn ends", () => {
    const { element, rerender, result } = setup({ isStreaming: true });

    element.scrollTop = 0;
    act(() => result.current.handleScroll());
    expect(result.current.userScrolledAway).toBe(true);

    rerender({ isStreaming: false });

    expect(result.current.userScrolledAway).toBe(false);
  });

  it("stays away across a turn that never ended", () => {
    const { element, rerender, result } = setup({ isStreaming: true });

    element.scrollTop = 0;
    act(() => result.current.handleScroll());

    rerender({ isStreaming: true });
    expect(result.current.userScrolledAway).toBe(true);
    expect(element.scrollTop).toBe(0);
  });

  it("does not throw before the container is attached", () => {
    const { result } = renderHook(() => useThreadScroll({ isStreaming: false }));

    expect(() => act(() => result.current.handleScroll())).not.toThrow();
    expect(() => act(() => result.current.scrollToBottom())).not.toThrow();
    expect(result.current.userScrolledAway).toBe(false);
  });
});
