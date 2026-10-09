import { Brain, Cloud, Key, Palette } from "lucide-react";

export const SECTIONS = [
  {
    id: "keys",
    label: "Keys",
    description: "HCAI and E2B keys",
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
    description: "Defaults, providers & limits",
    icon: Brain,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme & display options",
    icon: Palette,
  },
];
