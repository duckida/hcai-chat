import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateManifest,
  isOpenWebUIChat,
  convertOpenWebUIChatToNative,
  normalizeLibreChat,
  validateNativeChat,
  prepareChatsForImport,
  parseImportArchive,
  exportAllToZip,
  exportSingleChatToZip,
  readFileAsBuffer,
  importFromZipBuffer,
  stripSecrets,
} from "@/lib/import-export";

vi.mock("@/lib/db", () => ({
  getAllConversations: vi.fn().mockResolvedValue([]),
  putConversation: vi.fn().mockResolvedValue(undefined),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
  saveAllConversations: vi.fn().mockResolvedValue(undefined),
}));

describe("import-export", () => {
  describe("validateManifest", () => {
    it("rejects null manifest", () => {
      const result = validateManifest(null);
      expect(result.valid).toBe(false);
    });

    it("rejects wrong format", () => {
      const result = validateManifest({ format: "wrong", formatVersion: 1, includes: {} });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported format");
    });

    it("rejects wrong version", () => {
      const result = validateManifest({ format: "hcai-chat-export", formatVersion: 99, includes: {} });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("version");
    });

    it("accepts valid manifest", () => {
      const result = validateManifest({
        format: "hcai-chat-export",
        formatVersion: 1,
        includes: { chats: true },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("isOpenWebUIChat", () => {
    it("detects OpenWebUI format with messages array", () => {
      expect(isOpenWebUIChat({ messages: [{ role: "user", content: "hi" }] })).toBe(true);
    });

    it("detects OpenWebUI format with chat.messages", () => {
      expect(isOpenWebUIChat({ chat: { messages: [] } })).toBe(false);
      expect(isOpenWebUIChat({ chat: { messages: [{ role: "user", content: "hi" }] } })).toBe(true);
    });

    it("detects array of chats", () => {
      expect(isOpenWebUIChat([{ messages: [{ role: "user", content: "hi" }] }])).toBe(true);
    });

    it("rejects non-OpenWebUI objects", () => {
      expect(isOpenWebUIChat(null)).toBe(false);
      expect(isOpenWebUIChat({})).toBe(false);
      expect(isOpenWebUIChat({ messages: [] })).toBe(false);
    });
  });

  describe("convertOpenWebUIChatToNative", () => {
    it("converts standard format", () => {
      const chat = {
        title: "Test Chat",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there" },
        ],
      };
      const result = convertOpenWebUIChatToNative(chat);
      expect(result.title).toBe("Test Chat");
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content).toBe("Hello");
      expect(result.messages[1].role).toBe("assistant");
    });

    it("converts nested chat format", () => {
      const chat = {
        chat: {
          title: "Nested",
          messages: [{ role: "user", content: "test" }],
        },
      };
      const result = convertOpenWebUIChatToNative(chat);
      expect(result.title).toBe("Nested");
      expect(result.messages).toHaveLength(1);
    });

    it("generates id for imported chat", () => {
      const result = convertOpenWebUIChatToNative({
        messages: [{ role: "user", content: "hi" }],
      });
      expect(result.id).toBeTruthy();
      expect(typeof result.id).toBe("string");
    });
  });

  describe("normalizeLibreChat", () => {
    it("normalizes a LibreAssistant chat with parts", () => {
      const chat = {
        id: "test-id",
        title: "Test",
        lastUpdated: "2025-01-01T00:00:00Z",
        messages: [
          {
            id: "msg1",
            role: "user",
            parts: [{ type: "content", content: "Hello" }],
          },
          {
            id: "msg2",
            role: "assistant",
            parts: [
              { type: "reasoning", content: "Thinking..." },
              { type: "content", content: "Hi there!" },
            ],
          },
        ],
      };
      const result = normalizeLibreChat(chat);
      expect(result.id).toBe("test-id");
      expect(result.title).toBe("Test");
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe("Hello");
      expect(result.messages[1].content).toBe("Hi there!");
      expect(result.messages[1].thinking).toBe("Thinking...");
    });

    it("handles legacy content format", () => {
      const chat = {
        id: "legacy",
        title: "Legacy",
        messages: [{ role: "user", content: "Hello" }],
      };
      const result = normalizeLibreChat(chat);
      expect(result.messages[0].content).toBe("Hello");
    });

    it("returns null for invalid input", () => {
      expect(normalizeLibreChat(null)).toBeNull();
      expect(normalizeLibreChat("string")).toBeNull();
    });
  });

  describe("validateNativeChat", () => {
    it("accepts valid chat", () => {
      const result = validateNativeChat({
        id: "test",
        title: "Test",
        messages: [{ role: "user", content: "hi" }],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing id", () => {
      const result = validateNativeChat({ messages: [] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("id");
    });

    it("rejects missing messages", () => {
      const result = validateNativeChat({ id: "test" });
      expect(result.valid).toBe(false);
    });

    it("rejects message without role", () => {
      const result = validateNativeChat({
        id: "test",
        messages: [{ content: "hi" }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("prepareChatsForImport", () => {
    const chats = [
      { id: "new-1", title: "New", messages: [{ role: "user", content: "hi" }] },
      { id: "existing-1", title: "Existing", messages: [{ role: "user", content: "hi" }] },
    ];
    const existingIds = ["existing-1"];

    it("skip mode: skips existing", () => {
      const result = prepareChatsForImport(chats, existingIds, "skip");
      expect(result.chats).toHaveLength(1);
      expect(result.chats[0].id).toBe("new-1");
      expect(result.skipped).toEqual(["existing-1"]);
    });

    it("append mode: remaps existing IDs", () => {
      const result = prepareChatsForImport(chats, existingIds, "append");
      expect(result.chats).toHaveLength(2);
      expect(result.chats[1].id).not.toBe("existing-1");
      expect(result.skipped).toHaveLength(0);
    });
  });

  describe("stripSecrets", () => {
    it("removes API keys", () => {
      const settings = {
        apiKey: "sk-secret",
        e2bApiKey: "e2b-secret",
        selectedModel: "test",
      };
      const result = stripSecrets(settings);
      expect(result.apiKey).toBe("");
      expect(result.e2bApiKey).toBe("");
      expect(result.selectedModel).toBe("test");
    });

    it("does not mutate original", () => {
      const original = { apiKey: "sk-secret" };
      stripSecrets(original);
      expect(original.apiKey).toBe("sk-secret");
    });

    it("handles null input", () => {
      expect(stripSecrets(null)).toBeNull();
    });
  });

  describe("export/import roundtrip", () => {
    it("exportAllToZip produces a blob", async () => {
      const blob = await exportAllToZip({ includeChats: false, includeSettings: false });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/zip");
      expect(blob.size).toBeGreaterThan(0);
    });

    it("exportSingleChatToZip produces a blob with chat", async () => {
      const conv = {
        id: "test-conv",
        title: "Test",
        messages: [{ role: "user", content: "Hello" }],
      };
      const blob = await exportSingleChatToZip(conv);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it("parseImportArchive parses a valid zip", async () => {
      const conv = {
        id: "import-test",
        title: "Import Test",
        messages: [{ role: "user", content: "Hello" }],
      };
      const blob = await exportSingleChatToZip(conv);
      const buffer = await readFileAsBuffer(blob);
      const archive = parseImportArchive(new Uint8Array(buffer));
      expect(archive.chats).toHaveLength(1);
      expect(archive.chats[0].id).toBe("import-test");
      expect(archive.manifest).toBeTruthy();
    });
  });
});
