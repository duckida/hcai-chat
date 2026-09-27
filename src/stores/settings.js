"use client";

import {
  getDefaultSetting,
  readSetting,
  SETTING_KEYS,
  writeSetting,
} from "@/lib/settings";
import { createStore, useStore } from "@/lib/store";

const THEME_CLASSES = ["theme-sunrise", "theme-hackclub"];
const THEME_CLASS_BY_NAME = {
  sunrise: "theme-sunrise",
  hackclub: "theme-hackclub",
};

function defaultValues() {
  const values = {};
  for (const key of SETTING_KEYS) values[key] = getDefaultSetting(key);
  return values;
}

function applyThemeClass(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  const className = THEME_CLASS_BY_NAME[theme];
  if (className) root.classList.add(className);
}

export const settingsStore = createStore(defaultValues());

export function hydrateSettings() {
  const values = {};
  for (const key of SETTING_KEYS) values[key] = readSetting(key);
  settingsStore.setState(values);
  applyThemeClass(values.theme);
}

export function setSetting(key, value) {
  settingsStore.setState({ [key]: value });
  writeSetting(key, value);
  if (key === "theme") applyThemeClass(value);
}

export function useSettings(selector) {
  return useStore(settingsStore, selector);
}
