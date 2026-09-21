"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getDefaultSetting,
  readSetting,
  SETTING_KEYS,
  writeSetting,
} from "@/lib/settings";

const THEME_CLASSES = ["theme-sunrise", "theme-hackclub"];

function themeClassesFor(theme) {
  if (theme === "sunrise") return ["theme-sunrise"];
  if (theme === "hackclub") return ["theme-hackclub"];
  return [];
}

/**
 * Owns every user-persisted preference declared in SETTINGS.
 *
 * All values start at their SSR-safe defaults; stored values are hydrated
 * in a mount effect (never during render) so server and client markup
 * match on first paint. Writing through `setValue` persists immediately.
 */
export function useSettings() {
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const key of SETTING_KEYS) {
      initial[key] = getDefaultSetting(key);
    }
    return initial;
  });

  useEffect(() => {
    const hydrated = {};
    for (const key of SETTING_KEYS) {
      hydrated[key] = readSetting(key);
    }
    setValues(hydrated);
  }, []);

  useEffect(() => {
    const next = themeClassesFor(values.theme);
    const root = document.documentElement;
    root.classList.remove(...THEME_CLASSES);
    if (next.length > 0) root.classList.add(...next);
  }, [values.theme]);

  const setValue = useCallback((key, value) => {
    setValues((prev) =>
      prev[key] === value ? prev : { ...prev, [key]: value },
    );
    writeSetting(key, value);
  }, []);

  return { values, setValue };
}
