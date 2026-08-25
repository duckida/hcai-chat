import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { getAllConversations, putConversation } from "./db";

const EXPORT_FORMAT = "hcai-chat-export";
const EXPORT_FORMAT_VERSION = 1;
const CHATS_DIR = "chats";
const MANIFEST_FILE = "manifest.json";
const SETTINGS_FILE = "settings.json";
const SINGLE_CHAT_FILE = "chat.json";

function generateId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

function recordsToZipInput(records) {
  const input = {};
  for (const [name, value] of Object.entries(records)) {
    if (typeof value === "string") {
      input[name] = strToU8(value);
    } else if (value instanceof Uint8Array) {
      input[name] = value;
    }
  }
  return input;
}

function buildManifest({ includes, counts = {} }) {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    includes: {
      chats: !!includes.chats,
      settings: !!includes.settings,
    },
    counts: {
      chats: counts.chats ?? 0,
    },
  };
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateExportFilename(prefix = "hcai-chat-export") {
  const date = new Date().toISOString().split("T")[0];
  return `${prefix}-${date}.zip`;
}

export function generateSingleChatExportFilename(conversationId) {
  return `chat-${conversationId}.zip`;
}

export function stripSecrets(settings) {
  if (!settings || typeof settings !== "object") return settings;
  const copy = JSON.parse(JSON.stringify(settings));
  if (copy.apiKey) copy.apiKey = "";
  if (copy.e2bApiKey) copy.e2bApiKey = "";
  return copy;
}

export async function exportAllToZip({
  includeChats = true,
  includeSettings = true,
} = {}) {
  const records = {};
  let chatCount = 0;
  const includes = { chats: false, settings: false };

  if (includeSettings) {
    const apiKey = localStorage.getItem("hack_club_ai_key") || "";
    const e2bApiKey = localStorage.getItem("e2b_api_key") || "";
    const selectedModel = localStorage.getItem("selected_model") || "";
    const titleGenerationModel =
      localStorage.getItem("title_generation_model") || "";
    const thinkingEnabled = localStorage.getItem("thinking_enabled") || "";
    const artifactsEnabled = localStorage.getItem("artifacts_enabled") || "";
    const webSearchEnabled = localStorage.getItem("web_search_enabled") || "";
    const agentModeEnabled = localStorage.getItem("agent_mode_enabled") || "";
    const showThinking = localStorage.getItem("show_thinking") || "";
    const showSandboxCode = localStorage.getItem("show_sandbox_code") || "";
    const showSandboxOutput = localStorage.getItem("show_sandbox_output") || "";
    const showMetrics = localStorage.getItem("show_metrics") || "";
    const maxTokens = localStorage.getItem("max_tokens") || "";
    const theme = localStorage.getItem("theme") || "";

    const settings = {
      apiKey,
      e2bApiKey,
      selectedModel,
      titleGenerationModel,
      thinkingEnabled,
      artifactsEnabled,
      webSearchEnabled,
      agentModeEnabled,
      showThinking,
      showSandboxCode,
      showSandboxOutput,
      showMetrics,
      maxTokens,
      theme,
    };

    records[SETTINGS_FILE] = JSON.stringify(stripSecrets(settings), null, 2);
    includes.settings = true;
  }

  if (includeChats) {
    const conversations = await getAllConversations();
    for (const conv of conversations) {
      if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0)
        continue;
      const fileName = `${CHATS_DIR}/${conv.id}.json`;
      records[fileName] = JSON.stringify(conv, null, 2);
      chatCount++;
    }
    if (chatCount > 0) includes.chats = true;
  }

  const manifest = buildManifest({ includes, counts: { chats: chatCount } });
  records[MANIFEST_FILE] = JSON.stringify(manifest, null, 2);

  const zipBuffer = zipSync(recordsToZipInput(records), { level: 6 });
  return new Blob([zipBuffer], { type: "application/zip" });
}

export async function exportSingleChatToZip(conversation) {
  if (!conversation) throw new Error("Conversation is required");

  const records = {};
  records[SINGLE_CHAT_FILE] = JSON.stringify(conversation, null, 2);

  const includes = { chats: true, settings: false };
  const manifest = buildManifest({ includes, counts: { chats: 1 } });
  manifest.singleChat = true;
  manifest.conversationId = conversation.id;
  records[MANIFEST_FILE] = JSON.stringify(manifest, null, 2);

  const zipBuffer = zipSync(recordsToZipInput(records), { level: 6 });
  return new Blob([zipBuffer], { type: "application/zip" });
}

export function unzipToRecordMap(buffer) {
  const entries = unzipSync(buffer);
  const records = {};
  for (const [name, bytes] of Object.entries(entries)) {
    records[name] = strFromU8(bytes);
  }
  return records;
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, error: "Manifest is missing or invalid" };
  }
  if (manifest.format !== EXPORT_FORMAT) {
    return { valid: false, error: `Unsupported format: ${manifest.format}` };
  }
  if (manifest.formatVersion !== EXPORT_FORMAT_VERSION) {
    return {
      valid: false,
      error: `Unsupported format version: ${manifest.formatVersion}`,
    };
  }
  if (!manifest.includes || typeof manifest.includes !== "object") {
    return { valid: false, error: "Manifest is missing includes" };
  }
  return { valid: true };
}

export function isOpenWebUIChat(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (Array.isArray(obj.messages) && obj.messages.length > 0) return true;
  if (Array.isArray(obj.chat?.messages) && obj.chat.messages.length > 0)
    return true;
  if (Array.isArray(obj) && obj.length > 0 && obj[0]?.messages) return true;
  return false;
}

function normalizeOpenWebUIMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  const role = msg.role;
  const content = typeof msg.content === "string" ? msg.content : "";
  return {
    id: generateId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

export function convertOpenWebUIChatToNative(chat) {
  let messages = [];
  let title = "Imported chat";
  if (Array.isArray(chat?.messages)) {
    messages = chat.messages;
    title = chat.title || title;
  } else if (Array.isArray(chat?.chat?.messages)) {
    messages = chat.chat.messages;
    title = chat.chat?.title || chat.title || title;
  }

  const normalized = messages
    .map((m) => normalizeOpenWebUIMessage(m))
    .filter(Boolean);

  return {
    id: generateId(),
    title,
    createdAt: new Date().toISOString(),
    messages: normalized,
  };
}

function normalizeLibreMessage(msg) {
  if (!msg || typeof msg !== "object") return null;

  let content = "";
  let thinking = "";

  if (Array.isArray(msg.parts)) {
    const contentParts = [];
    const reasoningParts = [];
    for (const p of msg.parts) {
      if (p?.type === "content" && typeof p.content === "string") {
        contentParts.push(p.content);
      } else if (p?.type === "reasoning" && typeof p.content === "string") {
        reasoningParts.push(p.content);
      }
    }
    content = contentParts.join("\n");
    thinking = reasoningParts.join("\n");
  }

  if (!content && typeof msg.content === "string") {
    content = msg.content;
  }
  if (!thinking && typeof msg.reasoning === "string") {
    thinking = msg.reasoning;
  }

  const normalized = {
    id: msg.id || generateId(),
    role: msg.role || "user",
    content,
  };

  if (thinking) normalized.thinking = thinking;
  if (msg.tool_calls) normalized.tool_calls = msg.tool_calls;
  if (msg.sources) normalized.sources = msg.sources;
  if (msg.webSearch) normalized.webSearch = msg.webSearch;
  if (msg.sandboxResults) normalized.sandboxResults = msg.sandboxResults;
  if (msg.metrics) normalized.metrics = msg.metrics;
  if (msg.error) normalized.error = msg.error;

  return normalized;
}

export function normalizeLibreChat(chat) {
  if (!chat || typeof chat !== "object") return null;
  return {
    id: chat.id || generateId(),
    title: chat.title || "Imported chat",
    createdAt: chat.lastUpdated || chat.createdAt || new Date().toISOString(),
    messages: Array.isArray(chat.messages)
      ? chat.messages.map(normalizeLibreMessage).filter(Boolean)
      : [],
  };
}

export function validateNativeChat(chat) {
  if (!chat || typeof chat !== "object")
    return { valid: false, error: "Chat is not an object" };
  if (!chat.id || typeof chat.id !== "string")
    return { valid: false, error: "Chat is missing id" };
  if (!Array.isArray(chat.messages))
    return { valid: false, error: "Chat is missing messages array" };
  for (const msg of chat.messages) {
    if (!msg || typeof msg !== "object")
      return { valid: false, error: "Message is not an object" };
    if (!msg.role || typeof msg.role !== "string")
      return { valid: false, error: "Message is missing role" };
  }
  return { valid: true };
}

function remapMessageIds(chat) {
  const idMap = new Map();
  const cloned = JSON.parse(JSON.stringify(chat));
  for (const msg of cloned.messages) {
    const newId = generateId();
    idMap.set(msg.id, newId);
    msg.id = newId;
  }
  cloned.id = generateId();
  return cloned;
}

export function prepareChatsForImport(chats, existingIds, mode) {
  const existingSet = new Set(existingIds);
  const result = [];
  const skipped = [];

  for (const chat of chats) {
    const validation = validateNativeChat(chat);
    if (!validation.valid) continue;

    if (mode === "skip") {
      if (existingSet.has(chat.id)) {
        skipped.push(chat.id);
      } else {
        result.push(chat);
      }
    } else {
      if (existingSet.has(chat.id)) {
        result.push(remapMessageIds(chat));
      } else {
        result.push(chat);
      }
    }
  }

  return { chats: result, skipped };
}

export async function persistImportedChats(chats) {
  let importedCount = 0;
  let replacedCount = 0;

  for (const chat of chats) {
    const validation = validateNativeChat(chat);
    if (!validation.valid) continue;

    try {
      const existingConvs = await getAllConversations();
      const exists = existingConvs.some((c) => c.id === chat.id);

      await putConversation({
        ...chat,
        createdAt: chat.createdAt || new Date().toISOString(),
      });

      if (exists) replacedCount++;
      else importedCount++;
    } catch (error) {
      console.error("[importExport] Failed to persist chat:", error);
    }
  }

  return { imported: importedCount, replaced: replacedCount };
}

export async function persistImportedSettings(settings) {
  if (!settings || typeof settings !== "object") return false;

  if (settings.selectedModel)
    localStorage.setItem("selected_model", settings.selectedModel);
  if (settings.titleGenerationModel)
    localStorage.setItem(
      "title_generation_model",
      settings.titleGenerationModel,
    );
  if (settings.thinkingEnabled)
    localStorage.setItem("thinking_enabled", settings.thinkingEnabled);
  if (settings.artifactsEnabled)
    localStorage.setItem("artifacts_enabled", settings.artifactsEnabled);
  if (settings.webSearchEnabled)
    localStorage.setItem("web_search_enabled", settings.webSearchEnabled);
  if (settings.agentModeEnabled)
    localStorage.setItem("agent_mode_enabled", settings.agentModeEnabled);
  if (settings.showThinking)
    localStorage.setItem("show_thinking", settings.showThinking);
  if (settings.showSandboxCode)
    localStorage.setItem("show_sandbox_code", settings.showSandboxCode);
  if (settings.showSandboxOutput)
    localStorage.setItem("show_sandbox_output", settings.showSandboxOutput);
  if (settings.showMetrics)
    localStorage.setItem("show_metrics", settings.showMetrics);
  if (settings.maxTokens)
    localStorage.setItem("max_tokens", settings.maxTokens);
  if (settings.theme) localStorage.setItem("theme", settings.theme);

  return true;
}

export function parseImportArchive(buffer) {
  let records = {};
  let rawJson = null;

  try {
    records = unzipToRecordMap(buffer);
  } catch {
    const text =
      typeof buffer === "string" ? buffer : new TextDecoder().decode(buffer);
    try {
      rawJson = JSON.parse(text);
    } catch {
      throw new Error("File is not a valid zip or JSON file");
    }
  }

  const chats = [];
  let settings = null;
  let isOpenWebUI = false;

  if (rawJson) {
    if (isOpenWebUIChat(rawJson)) {
      isOpenWebUI = true;
      if (Array.isArray(rawJson)) {
        for (const c of rawJson) chats.push(convertOpenWebUIChatToNative(c));
      } else if (Array.isArray(rawJson.chats)) {
        for (const c of rawJson.chats)
          chats.push(convertOpenWebUIChatToNative(c));
      } else {
        chats.push(convertOpenWebUIChatToNative(rawJson));
      }
    } else if (validateNativeChat(rawJson).valid) {
      chats.push(rawJson);
    } else if (rawJson.chat && validateNativeChat(rawJson.chat).valid) {
      chats.push(rawJson.chat);
    }

    return { manifest: null, chats, settings, isOpenWebUI, records: {} };
  }

  const manifestRaw = records[MANIFEST_FILE];
  let manifest = null;
  if (manifestRaw) {
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      throw new Error("Manifest file is invalid JSON");
    }
  }

  if (manifest && manifest.format === EXPORT_FORMAT) {
    const manifestValidation = validateManifest(manifest);
    if (!manifestValidation.valid) throw new Error(manifestValidation.error);

    if (manifest.includes?.chats) {
      if (manifest.singleChat && records[SINGLE_CHAT_FILE]) {
        try {
          chats.push(JSON.parse(records[SINGLE_CHAT_FILE]));
        } catch {
          console.warn("[importExport] Could not parse single chat file");
        }
      } else {
        for (const [name, content] of Object.entries(records)) {
          if (name.startsWith(`${CHATS_DIR}/`) && name.endsWith(".json")) {
            try {
              chats.push(JSON.parse(content));
            } catch {
              console.warn(`[importExport] Could not parse chat file: ${name}`);
            }
          }
        }
      }
    }

    if (manifest.includes?.settings) {
      const settingsRaw = records[SETTINGS_FILE];
      if (settingsRaw) {
        try {
          settings = JSON.parse(settingsRaw);
        } catch {
          settings = null;
        }
      }
    }
  }

  if (!manifest || manifest.format !== EXPORT_FORMAT) {
    if (records[SINGLE_CHAT_FILE]) {
      try {
        const chat = JSON.parse(records[SINGLE_CHAT_FILE]);
        if (validateNativeChat(chat).valid) chats.push(chat);
      } catch {
        console.warn(
          "[importExport] Could not parse fallback single chat file",
        );
      }
    }
    for (const [name, content] of Object.entries(records)) {
      if (name.startsWith(`${CHATS_DIR}/`) && name.endsWith(".json")) {
        try {
          const chat = JSON.parse(content);
          if (validateNativeChat(chat).valid) chats.push(chat);
        } catch {
          console.warn(
            `[importExport] Could not parse fallback chat file: ${name}`,
          );
        }
      }
    }
  }

  return { manifest, chats, settings, isOpenWebUI, records };
}

export async function importFromZipBuffer(
  buffer,
  { chatsMode = "append", settingsMode = "replace" } = {},
) {
  const archive = parseImportArchive(buffer);

  const result = {
    chats: { imported: 0, replaced: 0, skipped: 0 },
    settings: false,
  };

  if (archive.chats.length > 0 && chatsMode !== "skip") {
    const existingConvs = await getAllConversations();
    const existingIds = existingConvs.map((c) => c.id);
    const { chats: preparedChats, skipped } = prepareChatsForImport(
      archive.chats,
      existingIds,
      chatsMode,
    );
    const persistResult = await persistImportedChats(preparedChats);
    result.chats = { ...persistResult, skipped: skipped.length };
  }

  if (archive.chats.length > 0 && chatsMode === "skip") {
    result.chats.skipped = archive.chats.length;
  }

  if (archive.settings && settingsMode === "replace") {
    result.settings = await persistImportedSettings(archive.settings);
  }

  return result;
}

export function readFileAsBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
