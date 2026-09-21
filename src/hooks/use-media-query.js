"use client";

import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * SSR-safe viewport match: false on the server and during first paint,
 * then the live value once mounted. Pairing this with a CSS fallback keeps
 * markup identical across hydration while still avoiding render-time
 * `window.innerWidth` reads.
 */
export function useMediaQuery(query = DESKTOP_QUERY) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY);
}
