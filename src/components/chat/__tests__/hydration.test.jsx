import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatApp from "@/components/chat/ChatApp";
import { resetConversations } from "@/stores/conversations";
import { resetModels } from "@/stores/models";
import {
  hydrateSettings,
  resetSettings,
  settingsStore,
} from "@/stores/settings";
import { resetTurn } from "@/stores/turn";

vi.mock("@/lib/db", () => ({
  getAllConversations: vi.fn(async () => []),
  saveAllConversations: vi.fn(async () => {}),
  putConversation: vi.fn(async () => {}),
  deleteConversation: vi.fn(async () => {}),
}));

/**
 * Hydration safety, tested the way the bug actually happened.
 *
 * Reading localStorage during render makes the first client paint disagree with
 * the server's HTML. React does not warn about that — it silently patches the
 * DOM, and the visible symptom is a flash of the wrong theme, a settings panel
 * that opens with the wrong toggles, or a full-page error in development.
 *
 * Comparing the server render with storage empty against the server render with
 * storage full catches it without having to guess which setting is currently
 * visible in the markup: if any component reads storage while rendering, the
 * two strings differ.
 */
describe("hydration safety", () => {
  const serverRender = () => {
    resetConversations();
    resetTurn();
    resetSettings();
    resetModels();
    return renderToString(<ChatApp />);
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("reads no storage while rendering", () => {
    // Spying on getItem is the direct assertion. Diffing the HTML against a
    // run with empty storage looks equivalent but is not: a read whose value
    // nothing in the current view depends on leaves the markup byte-identical
    // and the test green, which is exactly the read that becomes a bug the day
    // someone starts rendering that setting.
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    serverRender();

    const during = getItem.mock.calls.map(([key]) => key);
    getItem.mockRestore();

    expect(during).toEqual([]);
  });

  it("renders the same server HTML whether or not storage is populated", () => {
    localStorage.setItem("hack_club_ai_key", "sk-hc-test-key");
    const withoutStorage = serverRender();

    // Every key a returning user would have set, with values that differ from
    // the defaults.
    localStorage.setItem("selected_model", "qwen/qwen3.6-flash");
    localStorage.setItem("max_tokens", "1024");
    localStorage.setItem("thinking_enabled", "false");
    localStorage.setItem("artifacts_enabled", "true");
    localStorage.setItem("agent_mode_enabled", "true");
    localStorage.setItem("show_sandbox_output", "false");
    localStorage.setItem("theme", "hackclub");
    const withStorage = serverRender();

    expect(withStorage).toBe(withoutStorage);
  });

  it("takes the stored values once hydrateSettings runs", () => {
    // The other half: hydration is not skipped, just deferred. If the server
    // render is identical but the values never arrive, the app has silently
    // ignored every setting the user ever chose.
    localStorage.setItem("selected_model", "qwen/qwen3.6-flash");
    localStorage.setItem("max_tokens", "1024");

    serverRender();
    expect(settingsStore.getState().selectedModel).toBe("xiaomi/mimo-v2.5");
    expect(settingsStore.getState().maxTokens).toBe(32000);

    hydrateSettings();

    expect(settingsStore.getState().selectedModel).toBe("qwen/qwen3.6-flash");
    expect(settingsStore.getState().maxTokens).toBe(1024);
  });
});
