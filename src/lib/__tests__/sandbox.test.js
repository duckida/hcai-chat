import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sandbox from "@/lib/sandbox";

vi.mock("e2b", () => {
  const create = vi.fn();
  const connect = vi.fn();
  const kill = vi.fn();
  return { Sandbox: { create, connect, kill } };
});

const WORKSPACE = "/workspace";
const E2B_MISSING_KEY_MSG =
  "E2B API key is not set. Add it in Settings to use cloud sandbox.";

function makeHandle({ stdout = "", stderr = "", exitCode = 0 } = {}) {
  return {
    kill: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue({ stdout, stderr, exitCode }),
  };
}

function makeClient(sandboxId, overrides = {}) {
  return {
    sandboxId,
    files: {
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(Buffer.from("hello world")),
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      makeDir: vi.fn().mockResolvedValue(true),
    },
    commands: {
      run: vi.fn().mockResolvedValue(makeHandle()),
    },
    kill: vi.fn().mockResolvedValue(undefined),
    setTimeout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let createdCount = 0;

async function resetSandboxState() {
  await sandbox.destroyAllSandboxes();
  vi.clearAllMocks();
  createdCount = 0;
  const e2b = await import("e2b");
  e2b.Sandbox.create.mockImplementation(async () => {
    createdCount += 1;
    return makeClient(`sandbox-${createdCount}`);
  });
  e2b.Sandbox.connect.mockImplementation(async (sandboxId) =>
    makeClient(sandboxId),
  );
  e2b.Sandbox.kill.mockResolvedValue(undefined);
}

beforeEach(async () => {
  await resetSandboxState();
});

describe("getOrCreateSandbox", () => {
  it("throws when no api key is provided", async () => {
    await expect(sandbox.getOrCreateSandbox("conv-1", {})).rejects.toThrow(
      E2B_MISSING_KEY_MSG,
    );
  });

  it("creates a sandbox with metadata when none is cached", async () => {
    const { sandboxId } = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
    });
    const e2b = await import("e2b");
    expect(e2b.Sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "e2b-test",
        metadata: { conversationId: "conv-1", app: "hcai-chat" },
      }),
    );
    expect(sandboxId).toBe("sandbox-1");
    expect(sandbox.getSandboxCount()).toBe(1);
  });

  it("creates the /workspace directory on new sandboxes", async () => {
    await sandbox.getOrCreateSandbox("conv-1", { apiKey: "e2b-test" });
    const e2b = await import("e2b");
    const client = e2b.Sandbox.create.mock.results[0].value;
    const created = await client;
    expect(created.files.makeDir).toHaveBeenCalledWith("/workspace");
  });

  it("creates the /workspace directory when reconnecting", async () => {
    await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
      sandboxId: "existing-sandbox",
    });
    const e2b = await import("e2b");
    expect(e2b.Sandbox.connect).toHaveBeenCalledTimes(1);
    const client = await e2b.Sandbox.connect.mock.results[0].value;
    expect(client.files.makeDir).toHaveBeenCalledWith("/workspace");
  });

  it("reuses the cached sandbox for the same conversation", async () => {
    const first = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
    });
    const second = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
    });
    const e2b = await import("e2b");
    expect(e2b.Sandbox.create).toHaveBeenCalledTimes(1);
    expect(second.sandboxId).toBe(first.sandboxId);
  });

  it("connects to a requested sandboxId when provided", async () => {
    const { sandboxId } = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
      sandboxId: "existing-sandbox",
    });
    const e2b = await import("e2b");
    expect(e2b.Sandbox.connect).toHaveBeenCalledWith("existing-sandbox", {
      apiKey: "e2b-test",
    });
    expect(e2b.Sandbox.create).not.toHaveBeenCalled();
    expect(sandboxId).toBe("existing-sandbox");
  });

  it("falls back to creating a new sandbox when connect fails", async () => {
    const e2b = await import("e2b");
    e2b.Sandbox.connect.mockRejectedValueOnce(new Error("connection refused"));
    const { sandboxId } = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
      sandboxId: "dead-sandbox",
    });
    expect(e2b.Sandbox.create).toHaveBeenCalledTimes(1);
    expect(sandboxId).toBe("sandbox-1");
  });

  it("evicts the least recently used sandbox when over the limit", async () => {
    for (let i = 1; i <= 3; i++) {
      await sandbox.getOrCreateSandbox(`conv-${i}`, { apiKey: "e2b-test" });
    }
    await sandbox.getOrCreateSandbox("conv-4", { apiKey: "e2b-test" });

    expect(sandbox.getSandboxCount()).toBe(3);
    expect(
      sandbox.listSandboxes().some((s) => s.sandboxId === "sandbox-1"),
    ).toBe(false);
    expect(sandbox.listSandboxes().map((s) => s.sandboxId).sort()).toEqual([
      "sandbox-2",
      "sandbox-3",
      "sandbox-4",
    ]);
  });
});

describe("executeCode", () => {
  it("writes the script to the workspace and runs it", async () => {
    const { client } = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
    });
    client.commands.run.mockResolvedValue(
      makeHandle({ stdout: "out", exitCode: 0 }),
    );
    const result = await sandbox.executeCode("conv-1", "console.log('hi')", {
      apiKey: "e2b-test",
    });

    expect(client.files.write).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${WORKSPACE}/\\.hcai-run-.*\\.mjs$`)),
      "console.log('hi')",
    );
    expect(client.commands.run).toHaveBeenCalledWith(
      expect.stringContaining("node"),
      expect.objectContaining({ cwd: WORKSPACE }),
    );
    expect(result).toMatchObject({ stdout: "out", exitCode: 0 });
    expect(result.sandboxId).toBe("sandbox-1");
    expect(client.files.remove).toHaveBeenCalled();
  });

  it("returns the command result when execution exits with a non-zero code", async () => {
    const e2b = await import("e2b");
    const failingClient = makeClient("sandbox-1");
    failingClient.commands.run.mockResolvedValue(
      makeHandle({ stdout: "boom", stderr: "err detail", exitCode: 1 }),
    );
    e2b.Sandbox.create.mockImplementationOnce(async () => failingClient);

    const result = await sandbox.executeCode("conv-1", "process.exit(1)", {
      apiKey: "e2b-test",
    });
    expect(result).toEqual({
      stdout: "boom",
      stderr: "err detail",
      exitCode: 1,
      sandboxId: "sandbox-1",
    });
  });

  it("truncates output beyond the limit", async () => {
    const e2b = await import("e2b");
    const bigClient = makeClient("sandbox-1");
    bigClient.commands.run.mockResolvedValue(
      makeHandle({ stdout: "x".repeat(150_000), exitCode: 0 }),
    );
    e2b.Sandbox.create.mockImplementationOnce(async () => bigClient);

    const result = await sandbox.executeCode("conv-1", "big output", {
      apiKey: "e2b-test",
    });
    expect(result.stdout.length).toBeLessThan(150_000);
    expect(result.stdout).toContain("output truncated at 100000");
  });
});

describe("runCommand", () => {
  it("runs the command with a longer timeout", async () => {
    const { client } = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
    });
    const result = await sandbox.runCommand("conv-1", "ls -la", {
      apiKey: "e2b-test",
    });
    expect(client.commands.run).toHaveBeenCalledWith(
      "ls -la",
      expect.objectContaining({ cwd: WORKSPACE, timeoutMs: expect.any(Number) }),
    );
    expect(result.exitCode).toBe(0);
  });
});

describe("sandbox gone retry", () => {
  it("evicts the dead sandbox and retries once with a fresh one", async () => {
    const e2b = await import("e2b");
    const deadClient = makeClient("sandbox-1");
    deadClient.commands.run.mockRejectedValue(new Error("sandbox was killed"));
    const freshClient = makeClient("sandbox-2");
    freshClient.commands.run.mockResolvedValue(
      makeHandle({ stdout: "fresh", exitCode: 0 }),
    );
    e2b.Sandbox.create
      .mockImplementationOnce(async () => deadClient)
      .mockImplementationOnce(async () => freshClient);

    const result = await sandbox.executeCode("conv-1", "do work", {
      apiKey: "e2b-test",
    });
    expect(e2b.Sandbox.create).toHaveBeenCalledTimes(2);
    expect(result.stdout).toBe("fresh");
    expect(result.sandboxId).toBe("sandbox-2");
  });

  it("retries when setup fails with a sandbox-gone error", async () => {
    const e2b = await import("e2b");
    const deadClient = makeClient("sandbox-1");
    deadClient.files.write.mockRejectedValue(
      new Error("sandbox was killed"),
    );
    const freshClient = makeClient("sandbox-2");
    freshClient.commands.run.mockResolvedValue(
      makeHandle({ stdout: "ok", exitCode: 0 }),
    );
    e2b.Sandbox.create
      .mockImplementationOnce(async () => deadClient)
      .mockImplementationOnce(async () => freshClient);

    const result = await sandbox.executeCode("conv-1", "run me", {
      apiKey: "e2b-test",
    });
    expect(e2b.Sandbox.create).toHaveBeenCalledTimes(2);
    expect(result.stdout).toBe("ok");
    expect(result.sandboxId).toBe("sandbox-2");
  });
});

describe("destroySandbox", () => {
  it("kills the cached sandbox for a conversation", async () => {
    const { client } = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
    });
    await sandbox.destroySandbox("conv-1");
    expect(client.kill).toHaveBeenCalledTimes(1);
    expect(sandbox.getSandboxCount()).toBe(0);
  });

  it("kills a remote sandbox by id when the cache is empty", async () => {
    const e2b = await import("e2b");
    await sandbox.destroySandbox("conv-1", {
      apiKey: "e2b-test",
      sandboxId: "remote-1",
    });
    expect(e2b.Sandbox.kill).toHaveBeenCalledWith("remote-1");
  });

  it("does nothing without a sandboxId or api key", async () => {
    const e2b = await import("e2b");
    await sandbox.destroySandbox("conv-1", { apiKey: "e2b-test" });
    await sandbox.destroySandbox("conv-1", { sandboxId: "remote-1" });
    expect(e2b.Sandbox.kill).not.toHaveBeenCalled();
  });
});

describe("listFiles", () => {
  it("filters hidden files, directories, and node_modules, strips the workspace prefix", async () => {
    const e2b = await import("e2b");
    const listingClient = makeClient("sandbox-1");
    listingClient.files.list.mockResolvedValue([
      { name: "a.js", path: `${WORKSPACE}/a.js`, type: "file", size: 10 },
      { name: ".env", path: `${WORKSPACE}/.env`, type: "file", size: 5 },
      { name: "src", path: `${WORKSPACE}/src`, type: "directory", size: 0 },
      {
        name: "node_modules",
        path: `${WORKSPACE}/node_modules`,
        type: "file",
        size: 999,
      },
      { name: "b.js", path: `${WORKSPACE}/sub/b.js`, type: "file", size: 20 },
    ]);
    e2b.Sandbox.create.mockImplementationOnce(async () => listingClient);

    const files = await sandbox.listFiles("conv-1", { apiKey: "e2b-test" });
    expect(files.map((f) => f.path)).toEqual(["a.js", "sub/b.js"]);
  });

  it("returns an empty array when listing fails", async () => {
    const e2b = await import("e2b");
    const failingClient = makeClient("sandbox-1");
    failingClient.files.list.mockRejectedValue(new Error("sandbox not found"));
    e2b.Sandbox.create.mockImplementationOnce(async () => failingClient);

    const files = await sandbox.listFiles("conv-1", { apiKey: "e2b-test" });
    expect(files).toEqual([]);
  });
});

describe("readFile", () => {
  it("returns file contents as a Buffer", async () => {
    const { client } = await sandbox.getOrCreateSandbox("conv-1", {
      apiKey: "e2b-test",
    });
    const data = await sandbox.readFile("conv-1", "out.txt", {
      apiKey: "e2b-test",
    });
    expect(Buffer.isBuffer(data)).toBe(true);
    expect(data.toString()).toBe("hello world");
    expect(client.files.read).toHaveBeenCalledWith(`${WORKSPACE}/out.txt`, {
      format: "bytes",
    });
  });

  it("rejects paths outside the workspace", async () => {
    await sandbox.getOrCreateSandbox("conv-1", { apiKey: "e2b-test" });
    await expect(
      sandbox.readFile("conv-1", "../../etc/passwd", { apiKey: "e2b-test" }),
    ).rejects.toThrow("outside the sandbox workspace");
  });
});
