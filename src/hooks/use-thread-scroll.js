"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How far the user has to get from the bottom before the view stops following
 * the stream. Wide enough that a small flick while a long answer grows under
 * the cursor does not count as taking over, narrow enough to be obvious once
 * they really have moved.
 */
const AWAY_THRESHOLD = 100;

/**
 * Scrolling for the message thread.
 *
 * The view follows the bottom of the conversation — new messages, the
 * streaming row, and the persisted answer replacing that row — unless the user
 * has scrolled away, in which case it stays where they put it and offers a
 * button to come back.
 *
 * Tail follows every render rather than a dependency list. Any render of the
 * thread means something above it changed, and the answer is the same each
 * time, so a list of dependencies would only ever be a slower, more
 * forgettable way of saying "whenever".
 */
export function useThreadScroll({ isStreaming }) {
  const scrollRef = useRef(null);
  const [userScrolledAway, setUserScrolledAway] = useState(false);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    setUserScrolledAway(false);
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setUserScrolledAway(distanceFromBottom > AWAY_THRESHOLD);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || userScrolledAway) return;
    element.scrollTop = element.scrollHeight;
  });

  // A finished turn hands scrolling back to the reader, so the next one starts
  // pinned to the bottom even if they had scrolled up through the last answer.
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) setUserScrolledAway(false);
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  return { scrollRef, userScrolledAway, handleScroll, scrollToBottom };
}
