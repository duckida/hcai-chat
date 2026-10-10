"use client";

import {
  getDefaultSetting,
  readSetting,
  SETTING_KEYS,
  sanitizeGoogleFont,
  writeSetting,
} from "@/lib/settings";
import { createStore, useStore } from "@/lib/store";

const THEME_CLASSES = ["theme-sunrise", "theme-hackclub", "theme-custom"];
const THEME_CLASS_BY_NAME = {
  sunrise: "theme-sunrise",
  hackclub: "theme-hackclub",
  custom: "theme-custom",
};

function defaultValues() {
  const values = {};
  for (const key of SETTING_KEYS) values[key] = getDefaultSetting(key);
  return values;
}

function getAccentForeground(hex) {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance =
    0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.179 ? "#111111" : "#ffffff";
}

function applyTheme(values) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  const className = THEME_CLASS_BY_NAME[values.theme];
  if (className) root.classList.add(className);

  if (values.theme === "custom") {
    // A stored font only reaches this point through `sanitizeGoogleFont`, but
    // the value is interpolated straight into a CSS declaration, so sanitize
    // again rather than trusting every caller of `setSetting`.
    const fontFamily = sanitizeGoogleFont(values.googleFont).trim() || "Inter";
    root.style.setProperty(
      "--font-inter",
      `"${fontFamily}", ui-sans-serif, system-ui, sans-serif`,
    );
    root.style.setProperty("--custom-accent", values.accentColor);
    // A user-picked light accent needs dark button text; a dark accent needs
    // white text to keep primary controls readable.
    root.style.setProperty(
      "--custom-accent-foreground",
      getAccentForeground(values.accentColor),
    );
  } else {
    root.style.removeProperty("--font-inter");
    root.style.removeProperty("--custom-accent");
    root.style.removeProperty("--custom-accent-foreground");
  }
}

export const settingsStore = createStore(defaultValues());

export function hydrateSettings() {
  const values = {};
  for (const key of SETTING_KEYS) values[key] = readSetting(key);
  settingsStore.setState(values);
  applyTheme(values);
}

export function setSetting(key, value) {
  settingsStore.setState({ [key]: value });
  writeSetting(key, value);
  if (["theme", "googleFont", "accentColor"].includes(key)) {
    applyTheme(settingsStore.getState());
  }
}

/**
 * Restore built-in defaults without touching storage. The store is a
 * module-level singleton, so a test that flips a toggle would otherwise leak
 * it into every test that renders after it.
 */
export function resetSettings() {
  const values = defaultValues();
  settingsStore.setState(values);
  applyTheme(values);
}

export function useSettings(selector) {
  return useStore(settingsStore, selector);
}
