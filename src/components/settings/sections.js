import { Brain, Cloud, Download, Key, Palette, Sliders } from "lucide-react";

export const SECTIONS = [
  {
    id: "connection",
    label: "Connection",
    description: "API key & security",
    icon: Key,
  },
  {
    id: "sandbox",
    label: "Sandbox",
    description: "Cloud Sandbox & E2B",
    icon: Cloud,
  },
  {
    id: "models",
    label: "Models",
    description: "Title generation & limits",
    icon: Brain,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme & color mode",
    icon: Palette,
  },
  {
    id: "behavior",
    label: "Behavior",
    description: "Defaults & metrics",
    icon: Sliders,
  },
  {
    id: "data",
    label: "Data",
    description: "Import & export",
    icon: Download,
  },
];
